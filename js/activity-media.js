import { supabase } from "./supabase.js?v=20260910-57";

export const ACTIVITY_IMAGE_BUCKET = "activity-images";
export const ACTIVITY_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
export const ACTIVITY_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif"
];

// Images d'activités : on limite la définition pour éviter de stocker des
// photos de téléphone inutilement lourdes. Les GIF sont conservés tels quels
// afin de ne pas perdre leur animation.
const ACTIVITY_IMAGE_MAX_DIMENSION = 1600;
const ACTIVITY_IMAGE_WEBP_QUALITY = 0.82;

function extensionFromFile(file) {
    const map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif"
    };

    return map[file.type] || "bin";
}

export function validateActivityImage(file) {
    if (!file) {
        return null;
    }

    if (!ACTIVITY_IMAGE_TYPES.includes(file.type)) {
        throw new Error("Format d'image non pris en charge. Utilisez JPG, PNG, WebP, GIF ou AVIF.");
    }

    if (file.size > ACTIVITY_IMAGE_MAX_SIZE) {
        throw new Error("L'image ne doit pas dépasser 10 Mo.");
    }

    return file;
}

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Impossible de lire cette image pour l'optimiser."));
        };

        image.src = objectUrl;
    });
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error("Impossible de compresser l'image."));
                return;
            }

            resolve(blob);
        }, type, quality);
    });
}

async function optimizeActivityImage(file) {
    // Une conversion via canvas détruirait l'animation d'un GIF.
    if (file.type === "image/gif") {
        return file;
    }

    try {
        const image = await loadImage(file);
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = longestSide > ACTIVITY_IMAGE_MAX_DIMENSION
            ? ACTIVITY_IMAGE_MAX_DIMENSION / longestSide
            : 1;

        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { alpha: true });
        if (!context) {
            return file;
        }

        context.drawImage(image, 0, 0, width, height);

        const webpBlob = await canvasToBlob(
            canvas,
            "image/webp",
            ACTIVITY_IMAGE_WEBP_QUALITY
        );

        // On ne remplace jamais une image par une version plus lourde.
        if (webpBlob.size >= file.size) {
            return file;
        }

        return new File(
            [webpBlob],
            `${file.name.replace(/\.[^.]+$/, "") || "activity"}.webp`,
            { type: "image/webp", lastModified: Date.now() }
        );
    } catch (error) {
        // Si le navigateur ne sait pas décoder le format, l'upload original
        // reste possible. On évite ainsi de casser la création d'une activité.
        console.warn("Optimisation de l'image impossible, upload original conservé :", error);
        return file;
    }
}

export async function uploadActivityImage(file, userId, activityId) {
    validateActivityImage(file);

    if (!userId || !activityId) {
        throw new Error("Utilisateur ou activité manquant pour l'upload.");
    }

    const optimizedFile = await optimizeActivityImage(file);
    const extension = extensionFromFile(optimizedFile);
    const path = `${userId}/${activityId}.${extension}`;

    const { error } = await supabase.storage
        .from(ACTIVITY_IMAGE_BUCKET)
        .upload(path, optimizedFile, {
            cacheControl: "31536000",
            upsert: true,
            contentType: optimizedFile.type
        });

    if (error) {
        throw error;
    }

    const { data } = supabase.storage
        .from(ACTIVITY_IMAGE_BUCKET)
        .getPublicUrl(path);

    return {
        path,
        url: data.publicUrl,
        originalSize: file.size,
        uploadedSize: optimizedFile.size,
        optimized: optimizedFile !== file
    };
}

export async function removeActivityImage(path) {
    if (!path) {
        return;
    }

    const { error } = await supabase.storage
        .from(ACTIVITY_IMAGE_BUCKET)
        .remove([path]);

    if (error) {
        console.warn("Impossible de supprimer l'image d'activité :", error);
    }
}
