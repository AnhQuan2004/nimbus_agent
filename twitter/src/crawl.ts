import dotenv from "dotenv";
import { Scraper } from "agent-twitter-client";

dotenv.config();

const amount = Number(process.env.TWEET_CRAWL) || 10;

export async function crawlTweets(scraper: Scraper, listUsers: string[]) {
  if (listUsers.length === 0) {
    console.error("No users to crawl");
    return;
  }
  for (const user of listUsers) {
    console.log("Crawling tweets for user:", user);
    const tweets = scraper.getTweets(user, amount);
    for await (const tweet of tweets) {
      console.log("Tweet:", tweet.text);
    }
  }
}
