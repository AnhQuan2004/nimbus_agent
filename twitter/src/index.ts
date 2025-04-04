import axios from "axios";
import { Scraper, SearchMode } from "agent-twitter-client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { askGemini } from "./ask";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const number = Number(process.env.REPLY_LATEST_TWEET) || 5;
const rapidApiHost = process.env.RAPIDAPI_HOST || "";
const rapidApiKey = process.env.RAPIDAPI_KEY || "";

// Hàm xóa từ đầu tiên của chuỗi
function removeFirstWord(str: string): string {
  const words = str.split(" ");
  return words.slice(1).join(" ");
}

// Helper function tạo thời gian chờ ngẫu nhiên
function randomSleep(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Đang chờ ${ms}ms...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function tạo các biến thể cho tin nhắn
function variateMessage(message: string): string {
  // Tạo danh sách các biến thể có thể
  const variations = [
    message,
    message + " 👍",
    message + " 🎉",
    "Hey, " + message,
    "Check this out: " + message,
    message + " #NFT",
    message + " #Airdrop",
    "Here you go: " + message,
  ];

  // Chọn ngẫu nhiên một biến thể
  return variations[Math.floor(Math.random() * variations.length)];
}

// Hàm reply tweet: tìm tweet mới, trả lời và lưu lại vào file replied.json
export const replyTweet = async function (
  genAI: GoogleGenerativeAI,
  scraper: Scraper,
  username: string
) {
  // Lấy danh sách tweet
  const replyTweetsResponse = await scraper.fetchSearchTweets(
    `@${username}`,
    number,
    SearchMode.Latest
  );
  const replyTweets = replyTweetsResponse.tweets;
  console.log("Số tweet fetch được:", replyTweets.length);

  // Lọc tweet chưa được reply
  let toReply = replyTweets;
  if (fs.existsSync("replied.json")) {
    const data = fs.readFileSync("replied.json", "utf-8");
    const replied = JSON.parse(data);
    toReply = replyTweets.filter(
      (tweet: any) => !replied.some((item: any) => item.id === tweet.id)
    );
    console.log(
      "Đã tìm file replied.json, số tweet chưa reply:",
      toReply.length
    );
  } else {
    console.log(
      "Không tìm thấy file replied.json, dùng tất cả tweet fetch được"
    );
    toReply = replyTweets;
  }

  // Chỉ xử lý tweet mới nhất (đầu tiên trong danh sách)
  if (toReply.length > 0) {
    const tweet = toReply[0]; // Chỉ lấy tweet đầu tiên
    console.log("Chỉ xử lý tweet mới nhất:", tweet.id);

    const replyID = tweet.id;
    const tweetText = tweet.text || "";
    const replyContent = removeFirstWord(tweetText);

    // Kiểm tra conversationId có tồn tại hay không
    const targetId = tweet.conversationId;
    if (!targetId) {
      console.log(`Tweet ${replyID} không có conversationId, bỏ qua.`);
    } else {
      console.log(`Đang xử lý tweet ${replyID} với conversationId ${targetId}`);

      // Lấy tweet gốc theo conversationId
      const target = await scraper.getTweet(targetId);
      const targetText = target?.text || "";

      // Thời gian chờ ngẫu nhiên trước khi lấy nội dung reply từ Gemini
      await randomSleep(2000, 5000);

      const contentToReply = await askGemini(
        genAI,
        "reply",
        targetText,
        replyContent
      );

      try {
        // Thời gian chờ ngẫu nhiên trước khi gửi reply
        await randomSleep(3000, 8000);

        const response = await scraper.sendTweet(contentToReply, replyID);
        console.log("Đã reply tweet id:", replyID);
      } catch (error) {
        console.error("Lỗi khi reply tweet:", error);
      }
    }
  } else {
    console.log("Không có tweet nào để reply.");
  }

  // Lưu toàn bộ tweet đã fetch vào file replied.json
  fs.writeFileSync("replied.json", JSON.stringify(replyTweets, null, 2));
  return replyTweets;
};

// Hàm kiểm tra retweet
async function checkRetweet(screenname: string, tweetId: string) {
  const options = {
    method: "GET",
    url: "https://twitter-api45.p.rapidapi.com/checkretweet.php",
    params: {
      screenname: screenname,
      tweet_id: tweetId,
    },
    headers: {
      "x-rapidapi-host": rapidApiHost,
      "x-rapidapi-key": rapidApiKey,
    },
  };

  try {
    console.log(
      `\nKiểm tra retweet của @${screenname} cho tweet ID ${tweetId}...`
    );
    const response = await axios.request(options);
    console.log("Kết quả kiểm tra retweet:", response.data);
    return response.data;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái retweet:", error);
    return null;
  }
}

// Hàm get tweet detail sử dụng API từ RapidAPI
async function getTweetDetail(conversationId: string) {
  const options = {
    method: "GET",
    url: "https://twitter-api45.p.rapidapi.com/tweet_thread.php",
    params: { id: conversationId },
    headers: {
      "x-rapidapi-host": rapidApiHost,
      "x-rapidapi-key": rapidApiKey,
    },
  };

  try {
    const response = await axios.request(options);
    const data = response.data as any; // Xác định kiểu dữ liệu là any để tránh lỗi
    console.log("Chi tiết tweet thread đầy đủ:", data);

    // Xử lý và lấy thông tin cần thiết từ thread
    if (
      data &&
      data.thread &&
      Array.isArray(data.thread) &&
      data.thread.length > 0
    ) {
      console.log("\nDanh sách replies trong thread:");

      // Danh sách tweets trong thread để kiểm tra retweet
      const tweetUsers: Array<{ username: string; tweetId: string }> = [];

      // Hiển thị thông tin replies
      data.thread.forEach((reply: any, index: number) => {
        const displayText = reply.display_text || reply.text || "No text";
        const authorName = reply.author?.screen_name || "Unknown user";
        const tweetId = reply.id_str || reply.id || "";

        console.log(`[${index + 1}] @${authorName}: ${displayText}`);

        // Thêm username và tweet ID vào danh sách (nếu có)
        if (authorName && authorName !== "Unknown user" && tweetId) {
          tweetUsers.push({ username: authorName, tweetId: tweetId });
        }
      });

      // Kiểm tra retweet cho tất cả usernames
      console.log("\nKiểm tra retweet của tất cả người dùng trong thread...");

      // Gọi hàm reply cho những người đã retweet
      await replyToRetweeters(global.scraper, conversationId, tweetUsers);
    } else {
      console.log("Không có replies trong thread.");
    }
  } catch (error) {
    console.error("Lỗi khi lấy tweet thread:", error);
  }
}

// Hàm reply người dùng đã retweet - sửa lại để reply trực tiếp vào tweet id
async function replyToRetweeters(
  scraper: Scraper,
  tweetId: string,
  tweetUsers: Array<{ username: string; tweetId: string }>
) {
  console.log("\nBắt đầu reply cho những người đã retweet...");

  // Tạo danh sách base URL cho link airdrop
  const baseUrls = [
    "https://anhquan.com",
    "https://anhquan.com/airdrop",
    "https://anhquan.io",
  ];

  for (const tweetUser of tweetUsers) {
    try {
      const { username, tweetId: userTweetId } = tweetUser;

      // Kiểm tra xem người dùng đã retweet chưa
      const retweetCheck = await checkRetweet(username, tweetId);

      // Xử lý kết quả trả về có thể là bất kỳ kiểu dữ liệu nào
      const isRetweeted =
        retweetCheck && (retweetCheck as any).is_retweeted === true;

      if (isRetweeted) {
        console.log(
          `@${username} đã retweet! Đang reply trực tiếp vào tweet của họ...`
        );

        // Chọn ngẫu nhiên URL cơ sở và thêm tham số ngẫu nhiên để tránh trùng lặp
        const randomUrl = baseUrls[Math.floor(Math.random() * baseUrls.length)];
        const uniqueUrl = `${randomUrl}?ref=${Math.floor(
          Math.random() * 10000
        )}`;

        // Tạo biến thể message
        const message = variateMessage(`airdrop link: ${uniqueUrl}`);

        // Thời gian chờ ngẫu nhiên trước khi gửi reply
        await randomSleep(3000, 10000);

        // Reply với message đã biến thể
        await scraper.sendTweet(message, userTweetId);

        console.log(
          `Đã reply "${message}" đến @${username} (tweet ID: ${userTweetId})`
        );
      } else {
        console.log(`@${username} chưa retweet, bỏ qua.`);
      }

      // Thời gian chờ ngẫu nhiên dài hơn giữa các lần xử lý người dùng
      await randomSleep(8000, 20000);
    } catch (error) {
      console.error(`Lỗi khi xử lý người dùng:`, error);
      // Chờ thêm thời gian nếu gặp lỗi
      await randomSleep(15000, 30000);
    }
  }
}

// Khai báo biến global để lưu scraper instance
declare global {
  var scraper: Scraper;
}

// Hàm lưu cookie vào file
async function cacheCookies(cookies: any) {
  try {
    fs.writeFileSync("cookies.json", JSON.stringify(cookies, null, 2));
    console.log("Đã lưu cookie vào file cookies.json");
  } catch (error) {
    console.error("Lỗi khi lưu cookie:", error);
  }
}

// Hàm lấy cookie từ file
async function getCachedCookies() {
  try {
    if (fs.existsSync("cookies.json")) {
      const cookiesData = fs.readFileSync("cookies.json", "utf-8");
      if (cookiesData && cookiesData.trim() !== "") {
        console.log("Đã tìm thấy file cookies.json");
        return JSON.parse(cookiesData);
      }
    }
    console.log("Không tìm thấy file cookies.json hoặc file rỗng");
    return null;
  } catch (error) {
    console.error("Lỗi khi đọc cookie:", error);
    return null;
  }
}

// Hàm login Twitter
async function login(
  scraper: Scraper,
  username: string,
  password: string,
  email: string,
  fa: string
) {
  try {
    // Thử sử dụng cookie đã cache
    const cachedCookies = await getCachedCookies();
    if (cachedCookies) {
      console.log("Đang thử đăng nhập bằng cookie đã lưu...");

      // Chuyển đổi cookie từ object sang string format
      const cookieStrings = cachedCookies.map(
        (cookie: any) =>
          `${cookie.name || cookie.key}=${cookie.value}; Domain=${
            cookie.domain
          }; Path=${cookie.path}; ${cookie.secure ? "Secure" : ""}; ${
            cookie.httpOnly ? "HttpOnly" : ""
          }; SameSite=${cookie.sameSite || "Lax"}`
      );

      if (cookieStrings.length > 0) {
        // Set cookie vào scraper
        await scraper.setCookies(cookieStrings);

        // Kiểm tra xem đã đăng nhập thành công chưa
        const isLoggedIn = await scraper.isLoggedIn();
        if (isLoggedIn) {
          console.log("Đăng nhập thành công bằng cookie đã lưu");
          return true;
        } else {
          console.log("Cookie đã hết hạn hoặc không hợp lệ, cần đăng nhập lại");
          // Không xóa cookie, chỉ đăng nhập lại và cập nhật
        }
      }
    }

    // Nếu không có cookie hoặc cookie không hợp lệ, đăng nhập bình thường
    console.log("Đăng nhập bằng thông tin tài khoản...");
    await scraper.login(username, password, email, fa);
    console.log("Đăng nhập Twitter thành công");

    // Lưu cookie mới
    const cookies = await scraper.getCookies();
    await cacheCookies(cookies);

    return true;
  } catch (error) {
    console.error("Lỗi khi đăng nhập:", error);
    return false;
  }
}

// Hàm main chạy cả 2 chức năng: reply tweet và lấy tweet detail
async function main() {
  // Khởi tạo instance cho genAI và scraper
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const scraper = new Scraper();

  // Lưu scraper vào biến global để sử dụng ở các hàm khác
  global.scraper = scraper;

  // Thông tin đăng nhập Twitter từ .env
  const username = process.env.TWITTER_USERNAME || "";
  const password = process.env.TWITTER_PASSWORD || "";
  const email = process.env.TWITTER_EMAIL || "";
  const fa = process.env.TWITTER_2FA_SECRET || "";

  console.log("Bắt đầu quá trình xử lý...");

  // Đăng nhập Twitter
  const loggedIn = await login(scraper, username, password, email, fa);
  if (!loggedIn) {
    console.error("Không thể đăng nhập vào Twitter. Đang dừng chương trình...");
    return;
  }

  // Reply tweet và lấy kết quả trả về
  console.log("Đang chạy replyTweet...");
  const replyTweets = await replyTweet(genAI, scraper, username);

  // Lấy tweet_id và gọi API get tweet detail
  if (replyTweets.length > 0) {
    // Lấy ID của tweet đầu tiên và conversation ID
    const firstTweetId = replyTweets[0].id;
    const conversationId = replyTweets[0].conversationId;

    console.log("ID của tweet đầu tiên:", firstTweetId);
    console.log("ConversationId của tweet đầu tiên:", conversationId);

    if (conversationId) {
      // Lấy tweet gốc từ conversationId
      const originalTweet = await scraper.getTweet(conversationId);

      if (originalTweet && originalTweet.id) {
        console.log("ID của tweet gốc:", originalTweet.id);
        // Sử dụng ID của tweet gốc để lấy thread
        await getTweetDetail(originalTweet.id);
      } else {
        console.log(
          "Không thể lấy thông tin tweet gốc. Sử dụng conversation ID..."
        );
        await getTweetDetail(conversationId);
      }
    } else if (firstTweetId) {
      console.log(
        "Tweet đầu tiên không có conversationId. Sử dụng tweet ID..."
      );
      await getTweetDetail(firstTweetId);
    } else {
      console.log("Không thể xác định ID để lấy chi tiết tweet.");
    }
  } else {
    console.log("Không có tweet nào để reply.");
  }
}

main().catch((error) => {
  console.error("Lỗi trong quá trình thực thi:", error);
});
