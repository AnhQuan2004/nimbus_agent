import { Scraper, SearchMode } from 'agent-twitter-client';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { askGemini } from './ask';
import dotenv from "dotenv";
import fs from "fs"
import { log } from 'console';
import { stringify } from 'querystring';

dotenv.config();

const number = Number(process.env.REPLY_LATEST_TWEET) || 5;

function removeFirstWord(str: string): string {
    const words = str.split(" ");
    return words.slice(1).join(" ");
}

export const replyTweet = async function handle(genAI: GoogleGenerativeAI, scraper: Scraper, username: string) {
    const replyTweets = (
        await scraper.fetchSearchTweets(
            `@${username}`,
            number,
            SearchMode.Latest
        )
    ).tweets;

    let toReply = replyTweets;
    if (fs.existsSync("replied.json")) {
        const respone = fs.readFileSync("replied.json", 'utf-8')
        const replied = JSON.parse(respone);

        toReply = replyTweets.filter(item1 => {
            const respone = replied.some((item2: any) => item1.id == item2.id)
            return !respone;
        })
    }

    toReply.map(async (tweet: any) => {

        //Reply
        const replyID = tweet.id;
        const replyContent = removeFirstWord(tweet.text);

        //Main Tweet
        const targetId = tweet.conversationId;
        const target = await scraper.getTweet(targetId);
        const targetText = target?.text;
        const contentToReply = await askGemini(genAI, "reply", targetText, replyContent);

        try {
            const response = await scraper.sendTweet(contentToReply, replyID);
        } catch (error) {
            console.log("Error when replying:", error);
        }

    })

    const respone = fs.writeFileSync("replied.json", JSON.stringify(replyTweets))
    
}