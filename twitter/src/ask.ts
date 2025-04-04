import { GoogleGenerativeAI } from "@google/generative-ai";
import agentData from "../character/main.json";
import dotenv from "dotenv";

dotenv.config();

const tweetChar = process.env.TWEET_CHAR_LIMIT || 200;
const aiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

const prompt = `Imagine you are ${agentData.bio.join(
  ", "
)} and have knowledge of ${agentData.knowledge.join(
  ", "
)}. Write a tweet about ${tweetChar} characters. `;

export async function askGemini(
  genAi: GoogleGenerativeAI,
  mission: string,
  targetText?: any,
  replyContent?: any
): Promise<string> {
  const model = genAi.getGenerativeModel({ model: aiModel });

  try {
    var sub;
    if (mission === "tweet") {
      console.log("Tweeting...");
      sub = `
    ### Requirements:  
    - Keep the tweet within **280 characters**.  
    - Start with a **strong hook** to grab attention.  
    - Maintain a **conversational, natural, and engaging** tone.  
    - Use **emojis** if appropriate to enhance expression.  
    - Include **hashtags** if provided or if relevant.  
    - Optionally, add a **call-to-action** (e.g., "What do you think?", "Share your experience!").  
    
    ### Style Guide:  
    - If the topic is **informative**, keep it **concise and insightful**.  
    - If the topic is **promotional**, highlight the **benefits or excitement** clearly.  
    - If the topic is **trendy**, use a **playful or humorous angle**.  
    
    ### Output Format:  
    Return only the tweet text without any additional explanations.
    `;
    } else if (mission === "reply") {
      console.log("Replying...");
      sub = `
    ### Input:
    - Post content: "${targetText}"  
    - Comment content: "${replyContent}"  
    
    ### Requirements:
    - The reply must **directly address** the comment.  
    - If the comment is a question, provide a **clear and complete answer**.  
    - If the comment is positive (praise or agreement), express **gratitude** or agreement.  
    - If the comment is negative, respond **politely**, maintaining a **positive attitude** or providing a **brief explanation**.  
    - Keep the reply within **1-2 sentences**, short but **expressive**.  
    - Maintain a **friendly and natural** tone.  
    
    ### Output Format:
    Return only the reply text without any additional explanations.
    `;
    }
    const result = await model.generateContent(prompt + sub);
    return result.response.text();
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "";
  }
}
