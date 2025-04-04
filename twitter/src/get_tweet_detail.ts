import axios from "axios";

const options = {
  method: "GET",
  url: "https://twitter-api45.p.rapidapi.com/tweet_thread.php",
  params: { id: "1900409193380843671" },
  headers: {
    "x-rapidapi-host": "twitter-api45.p.rapidapi.com",
    "x-rapidapi-key": "a1db37b8edmsh58bcf1f194ccfd5p1b429cjsn1bafded385d7",
  },
};

axios
  .request(options)
  .then((response: any) => {
    console.log(response.data);
  })
  .catch((error) => {
    console.error("Error fetching tweet thread:", error);
  });
