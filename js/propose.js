import { supabase } from "./supabase.js";

const form = document.getElementById("proposal-form");
const message = document.getElementById("proposal-message");
const proposalsContainer = document.getElementById("my-proposals");

const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const dateInput = document.getElementById("date");
const startTimeInput = document.getElementById("start-time");
const endTimeInput = document.getElementById("end-time");
const minPlayersInput = document.getElementById("min-players");
const maxPlayersInput = document.getElementById("max-players");
const submitButton = document.getElementById("submit-proposal");


/*
 * Retourne la date du jour au format YYYY-MM-DD.
 */
function getToday() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/*
 * Retourne la date située exactement un mois après aujourd'hui.
 *
 * Exemple :
 * 6 juillet -> 6 août
 */
function getOneMonthLater() {
    const date = new Date();

    date.setMonth(date.getMonth() + 1);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


/*
 * Configure les limites du champ date.
 */
function setupDateLimits() {
    const today = getToday();
    const maxDate = getOneMonthLater();

    dateInput.min = today;
    dateInput.max = maxDate;
}


/*
 * Vérifie les données du formulaire avant l'envoi.
 */
function validateForm() {
    const minPlayers = Number(minPlayersInput.value);
    const maxPlayers = Number(maxPlayersInput.value);

    if (startTimeInput.value >= endTimeInput.value) {
        message.textContent =
            "L'heure de fin doit être après l'heure de début.";

        return false;
    }

    if (minPlayers <= 0 || maxPlayers <= 0) {
        message.textContent =
            "Le nombre de joueurs doit être supérieur à 0.";

        return false;
    }

    if (minPlayers > maxPlayers) {
        message.textContent =
            "Le minimum de joueurs ne peut pas dépasser le maximum.";

        return false;
    }

    return true;
}


/*
 * Vérifie que l'utilisateur est connecté.
 */
async function getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
        console.error("Erreur récupération utilisateur :", error);
        return null;
    }

    return data.user;
}


/*
 * Envoie une nouvelle proposition à Supabase.
 */
async function submitProposal(user) {
    const { error } = await supabase
        .from("activities")
        .insert({
            title: titleInput.value.trim(),
            description: descriptionInput.value.trim(),
            date: dateInput.value,
            start_time: startTimeInput.value,
            end_time: endTimeInput.value,
            min_players: Number(minPlayersInput.value),
            max_players: Number(maxPlayersInput.value),
            created_by: user.id,
            status: "pending"
        });

    if (error) {
        console.error("Erreur création proposition :", error);
        throw error;
    }
}


/*
 * Affiche les propositions créées par l'utilisateur.
 */
async function loadMyProposals(user) {
    proposalsContainer.textContent = "Chargement...";

    const { data, error } = await supabase
        .from("activities")
        .select(`
            id,
            title,
            description,
            date,
            start_time,
            end_time,
            min_players,
            max_players,
            status,
            created_at
        `)
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Erreur récupération propositions :", error);

        proposalsContainer.textContent =
            "Impossible de charger vos propositions.";

        return;
    }

    proposalsContainer.replaceChildren();

    if (data.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.textContent = "Vous n'avez encore aucune proposition.";
        proposalsContainer.appendChild(emptyMessage);

        return;
    }

    for (const proposal of data) {
        const article = document.createElement("article");
        article.className = "proposal-item";

        const title = document.createElement("h3");
        title.textContent = proposal.title;

        const date = document.createElement("p");
        date.textContent =
            `Date : ${proposal.date} | ${proposal.start_time} - ${proposal.end_time}`;

        const players = document.createElement("p");
        players.textContent =
            `Joueurs : ${proposal.min_players} à ${proposal.max_players}`;

        const status = document.createElement("p");

        switch (proposal.status) {
            case "pending":
                status.textContent = "Statut : En attente de validation";
                break;

            case "approved":
                status.textContent = "Statut : Acceptée";
                break;

            case "rejected":
                status.textContent = "Statut : Refusée";
                break;

            default:
                status.textContent = `Statut : ${proposal.status}`;
        }

        article.appendChild(title);
        article.appendChild(date);
        article.appendChild(players);
        article.appendChild(status);

        if (proposal.description) {
            const description = document.createElement("p");
            description.textContent = proposal.description;
            article.appendChild(description);
        }

        proposalsContainer.appendChild(article);
    }
}


/*
 * Gestion de l'envoi du formulaire.
 */
async function handleSubmit(event) {
    event.preventDefault();

    message.textContent = "";

    if (!validateForm()) {
        return;
    }

    const user = await getCurrentUser();

    if (!user) {
        message.textContent =
            "Vous devez être connecté pour proposer une activité.";

        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Envoi...";

    try {
        await submitProposal(user);

        message.textContent =
            "Votre proposition a bien été envoyée ! Elle doit maintenant être validée par un administrateur.";

        form.reset();

        setupDateLimits();

        await loadMyProposals(user);

    } catch (error) {
        message.textContent =
            "Impossible d'envoyer la proposition.";
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Envoyer la proposition";
    }
}


/*
 * Initialisation.
 */
async function init() {
    setupDateLimits();

    const user = await getCurrentUser();

    if (!user) {
        form.replaceChildren();

        const paragraph = document.createElement("p");
        paragraph.textContent =
            "Vous devez être connecté pour proposer une activité.";

        form.appendChild(paragraph);

        return;
    }

    await loadMyProposals(user);
}


form.addEventListener("submit", handleSubmit);

init();