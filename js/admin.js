import { supabase } from "./supabase.js";


// ==================================================
// ÉLÉMENTS HTML
// ==================================================

const membersList =
    document.getElementById("members-list");

const proposalsList =
    document.getElementById("proposals-list");

const adminMessage =
    document.getElementById("admin-message");


// ==================================================
// UTILISATEUR ACTUEL
// ==================================================

async function getCurrentUser() {

    const {
        data: { user },
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Erreur récupération utilisateur :",
            error
        );

        return null;
    }


    return user;
}


// ==================================================
// VÉRIFIER QUE L'UTILISATEUR EST ADMIN
// ==================================================

async function checkAdmin() {

    const user = await getCurrentUser();


    if (!user) {

        window.location.href = "login.html";

        return null;
    }


    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();


    if (error) {

        console.error(
            "Erreur récupération rôle :",
            error
        );

        return null;
    }


    if (profile.role !== "admin") {

        membersList.innerHTML = `
            <p>Accès refusé.</p>
        `;

        if (proposalsList) {
            proposalsList.innerHTML = "";
        }

        return null;
    }


    return user;
}


// ==================================================
// CHARGER LES MEMBRES
// ==================================================

async function loadMembers(currentUser) {

    const {
        data: members,
        error
    } = await supabase
        .from("profiles")
        .select(
            "id, pseudo, avatar_url, role, created_at"
        )
        .order("pseudo");


    if (error) {

        console.error(
            "Erreur récupération membres :",
            error
        );

        membersList.innerHTML = `
            <p>
                Impossible de charger les membres.
            </p>
        `;

        return;
    }


    if (!members || members.length === 0) {

        membersList.innerHTML = `
            <p>Aucun membre.</p>
        `;

        return;
    }


    membersList.innerHTML = "";


    for (const member of members) {

        const memberElement =
            document.createElement("article");

        memberElement.className =
            "admin-member";


        // ------------------------------------------
        // Avatar
        // ------------------------------------------

        const avatar =
            document.createElement("img");

        avatar.width = 60;
        avatar.height = 60;

        avatar.alt =
            `Photo de profil de ${member.pseudo}`;

        avatar.src =
            member.avatar_url ||
            "../assets/images/default-avatar.png";


        // ------------------------------------------
        // Informations
        // ------------------------------------------

        const info =
            document.createElement("div");


        const name =
            document.createElement("strong");

        name.textContent =
            member.pseudo || "Sans pseudo";


        const role =
            document.createElement("span");

        role.textContent =
            member.role;


        info.appendChild(name);
        info.appendChild(role);


        // ------------------------------------------
        // Bouton
        // ------------------------------------------

        const button =
            document.createElement("button");


        if (member.role === "admin") {

            button.textContent =
                "Rétrograder";

        } else {

            button.textContent =
                "Promouvoir admin";

        }


        // Impossible de modifier son propre rôle
        if (currentUser.id === member.id) {

            button.disabled = true;

            button.title =
                "Vous ne pouvez pas modifier votre propre rôle.";

        }


        button.addEventListener(
            "click",
            () => changeRole(member)
        );


        // ------------------------------------------
        // Assemblage
        // ------------------------------------------

        memberElement.appendChild(avatar);

        memberElement.appendChild(info);

        memberElement.appendChild(button);

        membersList.appendChild(memberElement);

    }
}


// ==================================================
// CHANGER LE RÔLE
// ==================================================

async function changeRole(member) {

    const newRole =
        member.role === "admin"
            ? "member"
            : "admin";


    const action =
        newRole === "admin"
            ? "promouvoir"
            : "rétrograder";


    const confirmed =
        window.confirm(
            `Voulez-vous ${action} ${member.pseudo} ?`
        );


    if (!confirmed) {
        return;
    }


    adminMessage.textContent =
        "Modification du rôle...";


    const {
        error
    } = await supabase.rpc(
        "set_user_role",
        {
            p_user_id: member.id,
            p_role: newRole
        }
    );


    if (error) {

        console.error(
            "Erreur modification rôle :",
            error
        );

        adminMessage.textContent =
            error.message ||
            "Impossible de modifier le rôle.";

        return;
    }


    adminMessage.textContent =
        `Le rôle de ${member.pseudo} a été modifié.`;


    const currentUser =
        await getCurrentUser();


    await loadMembers(currentUser);
}


// ==================================================
// CHARGER LES PROPOSITIONS
// ==================================================

async function loadProposals() {

    const {
        data: proposals,
        error
    } = await supabase
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
            created_at,
            created_by,
            profiles (
                pseudo,
                avatar_url
            )
        `)
        .in("status", ["pending", "rejected"])
        .order("created_at", {
            ascending: false
        });


    if (error) {

        console.error(
            "Erreur récupération propositions :",
            error
        );

        proposalsList.innerHTML = `
            <p>
                Impossible de charger les propositions.
            </p>
        `;

        return;
    }


    if (!proposals || proposals.length === 0) {

        proposalsList.innerHTML = `
            <p>
                Aucune proposition à traiter.
            </p>
        `;

        return;
    }


    proposalsList.innerHTML = "";


    for (const proposal of proposals) {

        const article =
            document.createElement("article");

        article.className =
            "admin-proposal";


        // ------------------------------------------
        // Titre
        // ------------------------------------------

        const title =
            document.createElement("h3");

        title.textContent =
            proposal.title;


        // ------------------------------------------
        // Description
        // ------------------------------------------

        const description =
            document.createElement("p");

        description.textContent =
            proposal.description ||
            "Aucune description.";


        // ------------------------------------------
        // Informations
        // ------------------------------------------

        const information =
            document.createElement("div");


        const date =
            document.createElement("p");

        date.textContent =
            `Date : ${proposal.date}`;


        const time =
            document.createElement("p");

        time.textContent =
            `Horaire : ${proposal.start_time} → ${proposal.end_time}`;


        const players =
            document.createElement("p");

        players.textContent =
            `Joueurs : ${proposal.min_players} à ${proposal.max_players}`;


        const creator =
            document.createElement("p");

        creator.textContent =
            `Proposé par : ${
                proposal.profiles?.pseudo ||
                "Utilisateur inconnu"
            }`;


        information.appendChild(date);

        information.appendChild(time);

        information.appendChild(players);

        information.appendChild(creator);


        // ------------------------------------------
        // Statut
        // ------------------------------------------

        const status =
            document.createElement("p");

        status.textContent =
            `Statut : ${proposal.status}`;


        // ------------------------------------------
        // Boutons
        // ------------------------------------------

        const buttons =
            document.createElement("div");


        if (proposal.status === "pending") {

            const approveButton =
                document.createElement("button");

            approveButton.textContent =
                "Approuver";


            approveButton.addEventListener(
                "click",
                () => updateProposalStatus(
                    proposal.id,
                    "approved"
                )
            );


            const rejectButton =
                document.createElement("button");

            rejectButton.textContent =
                "Refuser";


            rejectButton.addEventListener(
                "click",
                () => updateProposalStatus(
                    proposal.id,
                    "rejected"
                )
            );


            buttons.appendChild(
                approveButton
            );

            buttons.appendChild(
                rejectButton
            );

        }


        // ------------------------------------------
        // Assemblage
        // ------------------------------------------

        article.appendChild(title);

        article.appendChild(description);

        article.appendChild(information);

        article.appendChild(status);

        article.appendChild(buttons);

        proposalsList.appendChild(article);

    }
}


// ==================================================
// MODIFIER LE STATUT D'UNE PROPOSITION
// ==================================================

async function updateProposalStatus(
    activityId,
    newStatus
) {

    const action =
        newStatus === "approved"
            ? "approuver"
            : "refuser";


    const confirmed =
        window.confirm(
            `Voulez-vous ${action} cette proposition ?`
        );


    if (!confirmed) {
        return;
    }


    adminMessage.textContent =
        "Mise à jour de la proposition...";


    const {
        error
    } = await supabase
        .from("activities")
        .update({
            status: newStatus
        })
        .eq("id", activityId);


    if (error) {

        console.error(
            "Erreur mise à jour proposition :",
            error
        );

        adminMessage.textContent =
            error.message ||
            "Impossible de modifier la proposition.";

        return;
    }


    adminMessage.textContent =
        `Proposition ${action === "approuver"
            ? "approuvée"
            : "refusée"
        }.`;

    await loadProposals();
}


// ==================================================
// INITIALISATION
// ==================================================

async function init() {

    const currentUser =
        await checkAdmin();


    if (!currentUser) {
        return;
    }


    await loadMembers(currentUser);

    await loadProposals();
}


init();