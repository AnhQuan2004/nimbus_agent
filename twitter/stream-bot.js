const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // Thêm axios để gọi API

// Thời gian tự kiểm tra cho tweet mới (ms)
const CHECK_INTERVAL = 900000; // 15 phút

// Thời gian nghỉ giữa các lần polling khi đã phát hiện tweet mới (ms)
const ACTIVE_POLLING_INTERVAL = 60000; // 1 phút

// Thời gian chờ giữa các lần xử lý tweets (để tránh quá tải)
const PROCESSING_INTERVAL = 300000; // 5 phút

// Múi giờ Việt Nam (UTC+7)
const VIETNAM_TIMEZONE_OFFSET = 7;

// Cấu hình API authorize user
const AUTHORIZE_API_URL = "http://13.229.124.198:80/api/v1/contract/authorUser";
const PRIVATE_KEY =
  "suiprivkey1qz47laj9skkfpm0c2y8e70e4zfg4xcrq06yacljmmx6s02cw7ydpzrenq27";
const POOL_ID =
  "0x510edfa28771d6e42d0a859d7ddbafb2971d38cb09f8ded85dca012e3ff8a63d";

// Biến theo dõi thời gian xử lý gần nhất
let lastProcessingTime = 0;

// Biến kiểm soát trạng thái bot
let isProcessing = false;

// Lấy đường dẫn đầy đủ của node và npm
const nodeCmd = process.execPath;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

// Đường dẫn đến thư mục hiện tại
const currentDir = process.cwd();

// Hàm lấy giờ theo múi giờ Việt Nam
function getVietnamHour() {
  const date = new Date();

  // Lấy giờ UTC
  const utcHour = date.getUTCHours();

  // Chuyển đổi sang giờ Việt Nam (UTC+7)
  let vnHour = (utcHour + VIETNAM_TIMEZONE_OFFSET) % 24;

  // Đảm bảo giờ không âm
  if (vnHour < 0) vnHour += 24;

  return vnHour;
}

// Hàm lấy thời gian Việt Nam hiện tại
function getVietnamTime() {
  const now = new Date();
  const utcTime = now.getTime();
  const vnTime = new Date(utcTime + VIETNAM_TIMEZONE_OFFSET * 60 * 60 * 1000);
  return vnTime;
}

// Hàm authorize user thông qua API
async function authorizeUser(userAddress) {
  try {
    if (!userAddress) {
      logToFile(`Không thể authorize: userAddress trống`);
      return false;
    }

    logToFile(`Bắt đầu authorize cho địa chỉ: ${userAddress}`);

    const payload = {
      privateKey: PRIVATE_KEY,
      poolId: POOL_ID,
      userAddress: userAddress,
    };

    const response = await axios.post(AUTHORIZE_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      logToFile(`Authorize thành công cho địa chỉ: ${userAddress}`);
      logToFile(`API Response: ${JSON.stringify(response.data)}`);
      return true;
    } else {
      logToFile(
        `Authorize thất bại cho địa chỉ: ${userAddress}. Status code: ${response.status}`
      );
      return false;
    }
  } catch (error) {
    logToFile(`Lỗi khi authorize user: ${error.message}`);
    if (error.response) {
      logToFile(`API Response Error: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

// Hàm lưu log
function logToFile(message) {
  const timestamp = getVietnamTime().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFileSync("stream-bot.log", logMessage);
  console.log(message);
}

// Hàm thực thi lệnh npm với môi trường phù hợp
function executeNpmCommand(command, callback) {
  // Tạo lệnh hoàn chỉnh
  const fullCommand = `${npmCmd} ${command}`;
  logToFile(`Thực thi lệnh: ${fullCommand}`);

  // Chuẩn bị môi trường
  const options = {
    cwd: currentDir,
    env: { ...process.env, PATH: process.env.PATH },
  };

  // Thực thi lệnh
  exec(fullCommand, options, callback);
}

// Hàm đọc dữ liệu tweet để lấy địa chỉ người dùng từ nội dung tweet
function extractUserAddressFromTweets() {
  try {
    if (!fs.existsSync("replied_ids.json")) {
      logToFile("File replied_ids.json không tồn tại.");
      return null;
    }

    // Đọc file và lấy thông tin các tweet mới
    const data = fs.readFileSync("replied_ids.json", "utf-8");
    const repliedData = JSON.parse(data);

    // Nếu không có tweet mới cần xử lý
    if (
      !repliedData.new_conversations ||
      repliedData.new_conversations.length === 0
    ) {
      return null;
    }

    // Kiểm tra xem có tweet_contents không
    if (!repliedData.tweet_contents) {
      logToFile("Không tìm thấy tweet_contents trong file replied_ids.json");
      return null;
    }

    // Lấy danh sách các tweet chưa được xử lý
    const unprocessedTweets = repliedData.new_conversations.filter(
      (id) => !repliedData.replied_conversations.includes(id)
    );

    if (unprocessedTweets.length === 0) {
      return null;
    }

    // Đọc thông tin tweet đầu tiên cần xử lý
    const firstTweetId = unprocessedTweets[0];
    const tweetContent = repliedData.tweet_contents[firstTweetId];

    if (!tweetContent) {
      logToFile(`Không tìm thấy nội dung cho tweet ID: ${firstTweetId}`);
      return null;
    }

    // Trích xuất địa chỉ từ nội dung tweet
    // Giả sử địa chỉ là một chuỗi bắt đầu bằng "0x" và có 66 ký tự
    const addressRegex = /0x[a-fA-F0-9]{64}/;
    const match = tweetContent.match(addressRegex);

    if (match && match[0]) {
      logToFile(
        `Đã trích xuất được địa chỉ: ${match[0]} từ tweet ID: ${firstTweetId}`
      );
      return {
        userAddress: match[0],
        tweetId: firstTweetId,
      };
    } else {
      logToFile(
        `Không tìm thấy địa chỉ hợp lệ trong nội dung tweet: ${tweetContent}`
      );
      return null;
    }
  } catch (error) {
    logToFile(`Lỗi khi trích xuất địa chỉ từ tweet: ${error.message}`);
    return null;
  }
}

// Hàm kiểm tra xem có tweets mới không
async function checkForNewTweets() {
  try {
    // Kiểm tra file replied_ids.json để xem có tweets mới không
    if (!fs.existsSync("replied_ids.json")) {
      logToFile("File replied_ids.json không tồn tại. Bỏ qua kiểm tra.");
      return false;
    }

    const data = fs.readFileSync("replied_ids.json", "utf-8");
    const repliedData = JSON.parse(data);

    // Nếu có tweets mới chưa được reply
    if (
      repliedData.new_conversations &&
      repliedData.replied_conversations &&
      repliedData.new_conversations.length > 0
    ) {
      // Kiểm tra xem có tweet chưa được xử lý
      const unprocessedTweets = repliedData.new_conversations.filter(
        (id) => !repliedData.replied_conversations.includes(id)
      );

      return unprocessedTweets.length > 0;
    }

    return false;
  } catch (error) {
    logToFile(`Lỗi khi kiểm tra tweets mới: ${error.message}`);
    return false;
  }
}

// Hàm kiểm tra định kỳ mà không sử dụng polling liên tục
function scheduledCheck() {
  try {
    // Kiểm tra nếu đang trong giờ nghỉ (1-5 giờ sáng) theo giờ Việt Nam
    const currentHour = getVietnamHour();
    if (currentHour >= 1 && currentHour <= 5) {
      logToFile(
        `Đang trong giờ nghỉ (${currentHour} giờ sáng theo giờ Việt Nam). Tiếp tục kiểm tra sau ${
          CHECK_INTERVAL / 60000
        } phút.`
      );
      setTimeout(scheduledCheck, CHECK_INTERVAL);
      return;
    }

    // Hiển thị giờ hiện tại
    logToFile(`Giờ hiện tại: ${currentHour} giờ (Việt Nam) - Kiểm tra định kỳ`);

    // Nếu đang xử lý, bỏ qua lần này
    if (isProcessing) {
      logToFile("Đang xử lý tweets, bỏ qua lần kiểm tra này.");
      setTimeout(scheduledCheck, CHECK_INTERVAL);
      return;
    }

    // Chạy một lần để refresh danh sách tweets
    logToFile("Chạy kiểm tra tweets mới...");

    executeNpmCommand(
      "run dev -- --check-only",
      async (error, stdout, stderr) => {
        if (error) {
          logToFile(`Lỗi khi refresh tweets: ${error.message}`);
        } else {
          logToFile("Đã refresh danh sách tweets.");
        }

        // Kiểm tra xem có tweets mới không
        const hasNewTweets = await checkForNewTweets();

        if (hasNewTweets) {
          logToFile(
            "Phát hiện tweets mới, bắt đầu xử lý và chuyển sang chế độ polling..."
          );

          // Chuyển sang chế độ polling tích cực khi phát hiện tweet
          processTweets();
        } else {
          logToFile(
            "Không phát hiện tweets mới. Tiếp tục chế độ kiểm tra định kỳ."
          );
          setTimeout(scheduledCheck, CHECK_INTERVAL);
        }
      }
    );
  } catch (error) {
    logToFile(`Lỗi trong quá trình kiểm tra: ${error.message}`);
    setTimeout(scheduledCheck, CHECK_INTERVAL);
  }
}

// Hàm xử lý tweet và chuyển sang chế độ polling
async function processTweets() {
  // Kiểm tra điều kiện xử lý
  const currentTime = Date.now();
  const timeElapsed = currentTime - lastProcessingTime;

  if (timeElapsed < PROCESSING_INTERVAL && lastProcessingTime > 0) {
    logToFile(
      `Chưa đủ thời gian giữa các lần xử lý (${Math.floor(
        timeElapsed / 1000
      )}s/${PROCESSING_INTERVAL / 1000}s). Đợi một chút.`
    );
    setTimeout(processTweets, ACTIVE_POLLING_INTERVAL);
    return;
  }

  if (isProcessing) {
    logToFile("Đang trong quá trình xử lý. Đợi hoàn thành.");
    setTimeout(processTweets, ACTIVE_POLLING_INTERVAL);
    return;
  }

  isProcessing = true;

  try {
    // Trích xuất địa chỉ người dùng từ tweet
    const userInfo = extractUserAddressFromTweets();

    if (userInfo && userInfo.userAddress) {
      // Authorize user trước khi xử lý
      const authorized = await authorizeUser(userInfo.userAddress);

      if (authorized) {
        logToFile(
          `User đã được authorize thành công, tiến hành xử lý tweet ID: ${userInfo.tweetId}`
        );
      } else {
        logToFile(`Không thể authorize user, nhưng vẫn tiếp tục xử lý tweet`);
      }
    } else {
      logToFile(
        `Không tìm thấy địa chỉ user, tiếp tục xử lý tweet thông thường`
      );
    }

    // Xử lý tweets và kiểm tra tiếp
    executeNpmCommand(
      "run dev",
      async (processError, processStdout, processStderr) => {
        if (processError) {
          logToFile(`Lỗi khi xử lý tweets: ${processError.message}`);
        }

        if (processStderr) {
          logToFile(`Stderr: ${processStderr}`);
        }

        logToFile("Hoàn thành xử lý tweets:");
        logToFile(processStdout);

        // Cập nhật thời gian xử lý gần nhất
        lastProcessingTime = Date.now();
        isProcessing = false;

        // Kiểm tra lại xem còn tweets mới nào không sau khi xử lý
        executeNpmCommand(
          "run dev -- --check-only",
          async (error, stdout, stderr) => {
            if (error) {
              logToFile(`Lỗi khi kiểm tra lại tweets: ${error.message}`);
              setTimeout(scheduledCheck, CHECK_INTERVAL);
              return;
            }

            // Kiểm tra xem có tweets mới không
            const hasNewTweets = await checkForNewTweets();

            if (hasNewTweets) {
              logToFile(
                "Còn tweets mới chưa xử lý, tiếp tục chế độ polling tích cực..."
              );
              setTimeout(processTweets, ACTIVE_POLLING_INTERVAL);
            } else {
              logToFile(
                "Đã xử lý hết tweets mới, quay lại chế độ kiểm tra định kỳ."
              );
              setTimeout(scheduledCheck, CHECK_INTERVAL);
            }
          }
        );
      }
    );
  } catch (error) {
    logToFile(`Lỗi trong quá trình xử lý tweets: ${error.message}`);
    isProcessing = false;
    setTimeout(scheduledCheck, CHECK_INTERVAL);
  }
}

// Khởi động quá trình kiểm tra định kỳ
logToFile(
  `Stream Bot khởi động - Bắt đầu kiểm tra định kỳ cho tweets mới... (Giờ Việt Nam: ${getVietnamHour()} giờ)`
);
scheduledCheck();
