import { supabase } from "./supabase.js?v=20260909-07";
import { uploadActivityImage, removeActivityImage } from "./activity-media.js?v=20260909-07";

/*
 * Helper pour le panneau d'administration existant.
 * Il centralise l'appel au nouveau RPC update_activity à 11 paramètres.
 * Le panneau admin peut l'utiliser sans toucher directement à activities.
 */
export async function updateActivityWithNewFields({
    activityId,
    title,
    description,
    date,
    startTime,
    endTime,
    minPlayers,
    maxPlayers,
    location,
    isEvent,
    imageUrl
}) {
    const { error } = await supabase.rpc("update_activity", {
        p_activity_id: activityId,
        p_title: title,
        p_description: description || null,
        p_date: date,
        p_start_time: startTime,
        p_end_time: endTime,
        p_min_players: minPlayers,
        p_max_players: maxPlayers,
        p_location: location || null,
        p_is_event: Boolean(isEvent),
        p_image_url: imageUrl || null
    });

    if (error) {
        throw error;
    }
}

export async function uploadReplacementActivityImage(file, activityId, userId) {
    return uploadActivityImage(file, userId, activityId);
}

export { removeActivityImage };
