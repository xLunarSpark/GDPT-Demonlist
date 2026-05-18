import routes from './routes.js';

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
    toggleDark() {
        this.dark = !this.dark;
        localStorage.setItem(DARK_STORAGE_KEY, JSON.stringify(this.dark));
        syncDarkClass(this.dark);
    },
});

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
