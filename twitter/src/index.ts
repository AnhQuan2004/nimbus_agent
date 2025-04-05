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

  // Lấy danh sách ConversationID của các tweet mới
  const allConversationIds = replyTweets
    .filter((tweet: any) => tweet.conversationId)
    .map((tweet: any) => String(tweet.conversationId));

  console.log("ConversationIDs của các tweet mới nhận:", allConversationIds);

  // Đọc danh sách tweets đã reply từ file nếu tồn tại
  let repliedTweets: any[] = [];
  let repliedConversationIds: string[] = [];

  if (fs.existsSync("replied.json")) {
    try {
      const data = fs.readFileSync("replied.json", "utf-8");
      repliedTweets = JSON.parse(data);

      // Lấy tất cả conversationId đã xử lý
      repliedConversationIds = repliedTweets
        .filter((tweet: any) => tweet.conversationId)
        .map((tweet: any) => String(tweet.conversationId));

      console.log(
        "Đã đọc file replied.json, có",
        repliedTweets.length,
        "tweet đã reply"
      );
      console.log("ConversationIDs đã xử lý:", repliedConversationIds);
    } catch (error) {
      console.error("Lỗi khi đọc file replied.json:", error);
      repliedTweets = [];
      repliedConversationIds = [];
    }
  } else {
    console.log("Không tìm thấy file replied.json, tạo mới");
  }

  // Tạo file replied_ids.json để dễ debug
  fs.writeFileSync(
    "replied_ids.json",
    JSON.stringify(
      {
        new_conversations: allConversationIds,
        replied_conversations: repliedConversationIds,
      },
      null,
      2
    )
  );

  // Lọc tweet thuộc cuộc hội thoại chưa được xử lý
  const toReply = replyTweets.filter((tweet: any) => {
    // Chỉ xử lý tweet thuộc cuộc hội thoại có conversationId và chưa được xử lý
    return (
      tweet.conversationId &&
      !repliedConversationIds.includes(String(tweet.conversationId))
    );
  });

  console.log("Số tweet thuộc cuộc hội thoại chưa xử lý:", toReply.length);

  // Biến để theo dõi xem đã xử lý tweet mới nào chưa
  let repliedNewTweet = false;
  let repliedTweetInfo = null;

  // Chỉ xử lý tweet mới nhất (đầu tiên trong danh sách)
  if (toReply.length > 0) {
    const tweet = toReply[0]; // Chỉ lấy tweet đầu tiên
    console.log("Đang xử lý tweet mới nhất:", tweet.id);

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

        // Đánh dấu là đã reply một tweet mới
        repliedNewTweet = true;
        repliedTweetInfo = {
          id: replyID,
          conversationId: targetId,
        };

        // Thêm tweet vào danh sách đã reply cùng với timestamp
        const repliedTweet = {
          ...tweet,
          replied_at: new Date().toISOString(),
          reply_content: contentToReply,
        };
        repliedTweets.push(repliedTweet);

        // Lưu danh sách đã reply vào file
        fs.writeFileSync(
          "replied.json",
          JSON.stringify(repliedTweets, null, 2)
        );
        console.log("Đã cập nhật file replied.json");
      } catch (error) {
        console.error("Lỗi khi reply tweet:", error);
      }
    }
  } else {
    console.log("Không có cuộc hội thoại mới để reply.");
  }

  return { tweets: replyTweets, repliedNewTweet, repliedTweetInfo };
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

  // Tạo file để lưu các user bị lỗi khi reply
  const failedReplies: Array<{
    username: string;
    tweetId: string;
    reason: string;
    timestamp: string;
  }> = [];

  // Đọc file failed_replies.json nếu tồn tại
  if (fs.existsSync("failed_replies.json")) {
    try {
      const data = fs.readFileSync("failed_replies.json", "utf-8");
      const existingFailures = JSON.parse(data);
      if (Array.isArray(existingFailures)) {
        failedReplies.push(...existingFailures);
      }
    } catch (error) {
      console.error("Lỗi khi đọc file failed_replies.json:", error);
    }
  }

  // Đọc danh sách users đã được reply từ file
  let repliedUsers: string[] = [];
  if (fs.existsSync("replied_users.json")) {
    try {
      const data = fs.readFileSync("replied_users.json", "utf-8");
      const repliedUsersData = JSON.parse(data);
      if (Array.isArray(repliedUsersData)) {
        repliedUsers = repliedUsersData;
      } else if (
        repliedUsersData.users &&
        Array.isArray(repliedUsersData.users)
      ) {
        repliedUsers = repliedUsersData.users;
      }
      console.log("Danh sách users đã reply:", repliedUsers);
    } catch (error) {
      console.error("Lỗi khi đọc file replied_users.json:", error);
    }
  } else {
    console.log("Không tìm thấy file replied_users.json, tạo mới");
    fs.writeFileSync(
      "replied_users.json",
      JSON.stringify({ users: [] }, null, 2)
    );
  }

  // Lọc ra danh sách các username độc nhất để tránh xử lý trùng lặp
  const uniqueUsers = Array.from(
    new Set(tweetUsers.map((user) => user.username))
  );
  console.log("Số lượng users độc nhất cần kiểm tra:", uniqueUsers.length);

  // Nhóm tweet theo username để dễ xử lý
  const userTweets: { [username: string]: string[] } = {};
  tweetUsers.forEach(({ username, tweetId }) => {
    if (!userTweets[username]) {
      userTweets[username] = [];
    }
    userTweets[username].push(tweetId);
  });

  for (const username of uniqueUsers) {
    try {
      // Bỏ qua nếu user đã được reply trước đó
      if (repliedUsers.includes(username)) {
        console.log(`@${username} đã được reply trước đó, bỏ qua.`);
        continue;
      }

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

        // Lấy tweet id của user - chỉ lấy tweet đầu tiên nếu có nhiều tweet
        const userTweetId = userTweets[username][0];

        // Thời gian chờ ngẫu nhiên trước khi gửi reply
        await randomSleep(3000, 10000);

        try {
          // Reply với message đã biến thể
          await scraper.sendTweet(message, userTweetId);
          console.log(
            `Đã reply "${message}" đến @${username} (tweet ID: ${userTweetId})`
          );

          // Thêm username vào danh sách đã reply
          repliedUsers.push(username);
          fs.writeFileSync(
            "replied_users.json",
            JSON.stringify(
              {
                users: repliedUsers,
                last_updated: new Date().toISOString(),
              },
              null,
              2
            )
          );
          console.log(`Đã thêm @${username} vào danh sách đã reply`);
        } catch (replyError: any) {
          // Lưu lại thông tin user bị lỗi khi reply (có thể do spam)
          console.error(`Lỗi khi reply đến @${username}:`, replyError);

          failedReplies.push({
            username: username,
            tweetId: userTweetId,
            reason: replyError.message || "Unknown error",
            timestamp: new Date().toISOString(),
          });

          // Lưu danh sách các reply bị lỗi vào file
          fs.writeFileSync(
            "failed_replies.json",
            JSON.stringify(failedReplies, null, 2)
          );
          console.log(
            `Đã lưu thông tin lỗi reply của @${username} vào failed_replies.json`
          );

          // Thử phương pháp khác nếu có lỗi (có thể là do spam)
          try {
            console.log(`Thử phương pháp khác cho @${username}...`);
            // Tạo một phiên bản tweet khác để thử lại
            const alternativeMessage = `Hey @${username}, check this out: ${uniqueUrl}`;
            await scraper.sendTweet(alternativeMessage, userTweetId);
            console.log(
              `Đã reply thành công với phương pháp thay thế cho @${username}`
            );

            // Thêm username vào danh sách đã reply nếu thành công
            repliedUsers.push(username);
            fs.writeFileSync(
              "replied_users.json",
              JSON.stringify(
                {
                  users: repliedUsers,
                  last_updated: new Date().toISOString(),
                },
                null,
                2
              )
            );
          } catch (altError) {
            console.error(
              `Không thể reply cho @${username} ngay cả với phương pháp thay thế:`,
              altError
            );
          }
        }
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
  const result = await replyTweet(genAI, scraper, username);
  const replyTweets = result.tweets;

  // Chỉ kiểm tra tweet thread và retweet nếu đã reply một tweet mới
  if (result.repliedNewTweet && result.repliedTweetInfo) {
    console.log("Đã reply tweet mới, tiếp tục kiểm tra retweet...");

    // Lấy thông tin từ tweet đã reply
    const conversationId = result.repliedTweetInfo.conversationId;

    if (conversationId) {
      console.log("Xử lý conversationId:", conversationId);

      // Lấy tweet gốc từ conversationId
      const originalTweet = await scraper.getTweet(conversationId);

      if (originalTweet && originalTweet.id) {
        console.log("ID của tweet gốc:", originalTweet.id);
        // Sử dụng ID của tweet gốc để lấy thread
        await getTweetDetail(originalTweet.id);
      } else {
        console.log("Sử dụng conversation ID để lấy thread...");
        await getTweetDetail(conversationId);
      }
    } else {
      console.log("Không có conversationId, bỏ qua kiểm tra retweet.");
    }
  } else if (replyTweets.length > 0) {
    // Không có tweet mới nào được reply, nhưng vẫn có tweets
    console.log("Không có tweet mới nào được reply, bỏ qua kiểm tra retweet.");
  } else {
    console.log("Không có tweet nào để xử lý.");
  }
}

main().catch((error) => {
  console.error("Lỗi trong quá trình thực thi:", error);
});
