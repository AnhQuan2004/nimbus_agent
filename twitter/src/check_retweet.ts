import axios from "axios";

interface CheckRetweetResponse {
  // Define the structure of the response if known.
  // For example:
  // retweeted: boolean;
  // message?: string;
  [key: string]: any;
}

const options = {
  method: "GET",
  url: "https://twitter-api45.p.rapidapi.com/checkretweet.php",
  params: {
    screenname: "AnhQuan_03",
    tweet_id: "1900409193380843671",
  },
  headers: {
    "x-rapidapi-host": "twitter-api45.p.rapidapi.com",
    "x-rapidapi-key": "a1db37b8edmsh58bcf1f194ccfd5p1b429cjsn1bafded385d7",
  },
};

axios
  .request<CheckRetweetResponse>(options)
  .then((response) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error("Error checking retweet status:", error);
  });
