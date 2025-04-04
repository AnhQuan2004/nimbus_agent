# AGENT TWITTER NIMBUS AI

Twitter integration agent for the Nimbus AI platform, providing capabilities for Twitter interaction, monitoring, and automated responses.

## Features

- **Twitter Authentication**: Secure login and API access
- **Tweet Publishing**: Post tweets programmatically
- **Tweet Discovery**: Search and analyze tweets by keywords
- **Engagement Tracking**: Monitor retweets, likes, and replies
- **Automated Responses**: Reply to tweets automatically
- **Tweet Details**: Get comprehensive tweet information

## Installation

1. Clone the repository
2. Install dependencies:

```bash
cd twitter
npm install
```

## Configuration

Create a `.env` file based on the `.env.example` template:

```env
# Twitter API Credentials
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret

# OpenAI API Credentials (for AI capabilities)
OPENAI_API_KEY=your_openai_api_key
```

You need to obtain Twitter API credentials from the [Twitter Developer Platform](https://developer.twitter.com/).

## Usage

```typescript
import TwitterAgent from "./src/index";

// Initialize the Twitter agent
const agent = new TwitterAgent();

// Verify credentials and get user information
async function initializeAgent() {
  const loginResult = await agent.login();
  console.log("Logged in as:", loginResult.user.username);

  // Post a tweet
  const tweetResult = await agent.ask("Hello from Nimbus Twitter Agent!");

  // Search for tweets
  const searchResults = await agent.crawl("nimbus AI", 5);

  // Get tweet details
  const tweetDetails = await agent.getTweetDetail(tweetResult.tweetId);

  // Reply to a tweet
  await agent.reply(tweetResult.tweetId, "This is a reply to my own tweet!");
}

initializeAgent().catch(console.error);
```

## Building

```bash
npm run build
```

## Security

- All API keys and tokens are stored in environment variables
- Sensitive operations require explicit authentication
- Rate limiting is implemented to prevent API abuse

## Contributing

Contributions are welcome! Please follow the main project's contributing guidelines.

## License

GNU Affero General Public License - see LICENSE file for details in the main project
