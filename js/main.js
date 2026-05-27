import routes from './routes.js';
import { getCookie } from './util.js';

const DARK_STORAGE_KEY = 'dark';

function readDarkPreference() {
    try {
        return JSON.parse(localStorage.getItem(DARK_STORAGE_KEY)) === true;
    } catch {
        return false;
    }
}

function syncDarkClass(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
}

export const store = Vue.reactive({
    dark: readDarkPreference(),
    auth: Vue.reactive({
        username: null,
        isAdmin: false,
        loggedIn: false,
        refresh() {
            const username = getCookie('discord_username');
            const isAdminCookie = getCookie('is_admin');
            this.username = username;
            this.isAdmin = isAdminCookie === '1' || isAdminCookie === 'true';
            this.loggedIn = Boolean(username);
        },
        logout() {
            document.cookie = 'session=; Max-Age=0; path=/';
            document.cookie = 'discord_username=; Max-Age=0; path=/';
            document.cookie = 'is_admin=; Max-Age=0; path=/';
            this.refresh();
            window.location.reload();
        },
    }),
    toggleDark() {
        this.dark = !this.dark;
        localStorage.setItem(DARK_STORAGE_KEY, JSON.stringify(this.dark));
        syncDarkClass(this.dark);
    },
});

store.auth.refresh();

syncDarkClass(store.dark);

const app = Vue.createApp({
    data: () => ({ store }),
});
const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
});

app.use(router);

app.mount('#app');
