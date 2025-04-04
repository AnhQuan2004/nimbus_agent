import fs from "fs";
import { Scraper } from "agent-twitter-client";

async function cacheCookies(cookies: any) {
    fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
}

async function getCachedCookies() {
    if (fs.existsSync('cookies.json')) {
        const cookiesData = fs.readFileSync('cookies.json', 'utf-8');
        return JSON.parse(cookiesData);
    }
    return null;
}

async function clearCachedCookies() {
    if (fs.existsSync('cookies.json')) {
        fs.unlinkSync('cookies.json');
        console.log("Old cookies deleted.");
    }
}

export async function login(scraper: Scraper, username: string, password: string, email: string, fa: string) {

    try {
        const cachedCookies = await getCachedCookies();
        if (cachedCookies) {
            console.log("Using cached cookies...");
            const cookieStrings = cachedCookies.map(
                (cookie: any) =>
                    `${cookie.key}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}; ${cookie.secure ? "Secure" : ""}; ${cookie.httpOnly ? "HttpOnly" : ""}; SameSite=${cookie.sameSite || "Lax"}`
            );
            await scraper.setCookies(cookieStrings);

            const isLoggedIn = await scraper.isLoggedIn();
            if (!isLoggedIn) {
                console.log("Cookies expired or invalid. Logging in again...");
                await clearCachedCookies();
                await scraper.login(username, password, email, fa);
                const cookies = await scraper.getCookies();
                await cacheCookies(cookies);
            }
        } else {
            console.log("No cached cookies, logging in...");
            await scraper.login(username, password, email, fa);
            const cookies = await scraper.getCookies();
            await cacheCookies(cookies);
        }
    } catch (error: any) {
        console.error("Error login:", error);
    }

    return true;
}