import { supabase } from "./supabase.js";


// ==================================================
// ÉLÉMENTS HTML
// ==================================================

const membersList = document.getElementById("members-list");
const adminMessage = document.getElementById("admin-message");


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

        return null;
    }


    return user;
}


// ==================================================
// CHARGER LES MEMBRES
// ==================================================

async function loadMembers() {

    const {
        data: members,
        error
    } = await supabase
        .from("profiles")
        .select("id, pseudo, avatar_url, role, created_at")
        .order("pseudo");


    if (error) {

        console.error(
            "Erreur récupération membres :",
            error
        );

        membersList.innerHTML = `
            <p>Impossible de charger les membres.</p>
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


        // Empêcher de modifier son propre rôle
        const currentUser =
            await getCurrentUser();


        if (
            currentUser &&
            currentUser.id === member.id
        ) {

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


    await loadMembers();
}


// ==================================================
// INITIALISATION
// ==================================================

async function init() {

    const user = await checkAdmin();

    if (!user) {
        return;
    }


    await loadMembers();
}


init();