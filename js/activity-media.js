import { supabase } from "./supabase.js?v=20260909-07";

export const ACTIVITY_IMAGE_BUCKET = "activity-images";
export const ACTIVITY_IMAGE_MAX_SIZE = 10 * 1024 * 1024;
export const ACTIVITY_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/avif"
];

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

export async function uploadActivityImage(file, userId, activityId) {
    validateActivityImage(file);

    if (!userId || !activityId) {
        throw new Error("Utilisateur ou activité manquant pour l'upload.");
    }

    const extension = extensionFromFile(file);
    const path = `${userId}/${activityId}.${extension}`;

    const { error } = await supabase.storage
        .from(ACTIVITY_IMAGE_BUCKET)
        .upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type
        });

    if (error) {
        throw error;
    }

    const { data } = supabase.storage
        .from(ACTIVITY_IMAGE_BUCKET)
        .getPublicUrl(path);

    return {
        path,
        url: data.publicUrl
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
