// ==========================================
// MAIN APP LOGIC (Firebase + API + UI)
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// --- 1. CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDLd3TW-y89lwShUmcIHw3YGzDjo4cg3y4",
    authDomain: "animea2z.firebaseapp.com",
    projectId: "animea2z",
    storageBucket: "animea2z.firebasestorage.app",
    messagingSenderId: "673605765684",
    appId: "1:673605765684:web:a6f851e0d79836b79b1861"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --- 2. HTML ELEMENTS ---
const animeGrid = document.getElementById('animeGrid');
const searchInput = document.getElementById('searchInput');
const loading = document.getElementById('loading');
const userBtn = document.getElementById('userBtn');

// --- 3. AUTH CHECK (Login Status) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Agar login hai to photo dikhao
        userBtn.innerHTML = `<img src="${user.photoURL}" style="width:35px; height:35px; border-radius:50%; border:2px solid #7c4dff;">`;
        userBtn.href = "profile.html";
    } else {
        // Agar nahi hai to Login button
        userBtn.innerHTML = `<span style="background:#7c4dff; padding:5px 15px; border-radius:20px; font-size:12px; font-weight:bold;">Login</span>`;
        userBtn.href = "login.html";
    }
});

// --- 4. API FUNCTIONS ---
async function fetchAnime(endpoint) {
    try {
        loading.classList.remove('hidden'); // Loader on
        animeGrid.innerHTML = ''; // Clear old cards

        const response = await fetch(`https://api.jikan.moe/v4/${endpoint}`);
        const json = await response.json();
        
        displayAnime(json.data);
    } catch (error) {
        console.error(error);
        animeGrid.innerHTML = '<p class="text-center" style="color:red;">Error loading anime.</p>';
    } finally {
        loading.classList.add('hidden'); // Loader off
    }
}

function displayAnime(list) {
    if (!list || list.length === 0) {
        animeGrid.innerHTML = '<p class="text-center">No results found.</p>';
        return;
    }

    list.forEach(anime => {
        const title = anime.title_english || anime.title;
        const card = document.createElement('div');
        card.className = 'anime-card';
        
        // Click par Details page par le jao
        card.onclick = () => window.location.href = `details.html?id=${anime.mal_id}`;

        card.innerHTML = `
            <img src="${anime.images.jpg.image_url}" loading="lazy">
            <div class="card-content">
                <div class="card-title">${title}</div>
                <div class="card-score">⭐ ${anime.score || 'N/A'}</div>
            </div>
        `;
        animeGrid.appendChild(card);
    });
}

// --- 5. EVENTS (Search & Start) ---
// Page Load hote hi Trending Anime lao
fetchAnime('top/anime?filter=bypopularity&limit=20');

// Search Bar Logic
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query.length > 0) {
            fetchAnime(`anime?q=${query}&sfw`);
        }
    }
});
