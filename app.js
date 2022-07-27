const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let dataBase;
const dbAndServerInitializer = async () => {
  try {
    dataBase = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () =>
      console.log("Server running on http://localhost:3000")
    );
  } catch (error) {
    console.log(`DB Error:${error.message}`);
    process.exit(1);
  }
};
dbAndServerInitializer();

//middleware Function

const authenticateMiddlewareFunction = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  jwtToken = authHeader.split(" ")[1];
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_name_is_india", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//DB object to response object Convert

const dbObjToResObj = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.dateTime,
  };
};

//REGISTER API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const lengthOfPassword = password.length;
  const getUsernameQuery = `
    SELECT *
    FROM user
    WHERE username='${username}';`;
  const getUsername = await dataBase.get(getUsernameQuery);
  if (getUsername !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else if (lengthOfPassword < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const registerQuery = `
    INSERT INTO
    user(username,password,name,gender)
    VALUES('${username}',
    '${hashedPassword}',
    '${name}',
    '${gender}');`;
    await dataBase.run(registerQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

//Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUsernameQuery = `
    SELECT *
    FROM user
    WHERE username='${username}';`;
  const getUsername = await dataBase.get(getUsernameQuery);
  if (getUsername === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      getUsername.password
    );
    if (isPasswordCorrect === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_name_is_india");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get Twitter feed

app.get(
  "/user/tweets/feed/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const getTwitterFeedQuery = `
    SELECT user.name AS username,
    tweet.tweet,
    tweet.date_time AS dateTime
    FROM user INNER JOIN tweet 
    ON user.user_id = tweet.user_id
    WHERE 
    user.user_id IN (
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id=${userId}
    )
    ORDER BY dateTime DESC
    LIMIT 4
    `;
    const twitterFeed = await dataBase.all(getTwitterFeedQuery);
    response.send(twitterFeed.map((eachObject) => dbObjToResObj(eachObject)));
  }
);

//USER FOLLOWING
app.get(
  "/user/following/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const getFollowingNamesQuery = `
    SELECT user.name
    FROM user INNER JOIN follower 
    ON user.user_id = follower.follower_user_id
    WHERE 
    user.user_id IN (
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id=${userId}
    )
    GROUP BY user.user_id
    `;
    const getFollowingNames = await dataBase.all(getFollowingNamesQuery);
    response.send(getFollowingNames);
  }
);

//USER FOLLOWERS
app.get(
  "/user/followers/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const getFollowersNamesQuery = `
    SELECT user.name
    FROM user INNER JOIN follower 
    ON user.user_id = follower.follower_user_id
    WHERE 
    user.user_id IN (
        SELECT follower_user_id 
        FROM follower
        WHERE following_user_id=${userId}
    )
    GROUP BY user.user_id
    `;
    const getFollowersNames = await dataBase.all(getFollowersNamesQuery);
    response.send(getFollowersNames);
  }
);

// Tweet of user following

app.get(
  "/tweets/:tweetId/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const tweetIdsOfFollowingQuery = `
    SELECT tweet.tweet_id
    FROM user INNER JOIN tweet
    ON user.user_id =tweet.user_id
    WHERE 
    user.user_id IN (
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id=${userId}
    )`;
    const followingTweetIds = await dataBase.all(tweetIdsOfFollowingQuery);
    intOfTweetId = parseInt(tweetId);
    resultList = followingTweetIds.map((eachObject) => eachObject.tweet_id);
    const result = resultList.includes(intOfTweetId);
    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getTweetQuery = `
        SELECT tweet.tweet,
        COUNT(like.tweet_id) AS likes,
        COUNT(reply.tweet_id) AS replies,
        tweet.date_time AS dateTime
        FROM tweet INNER JOIN like
        ON tweet.tweet_id = like.tweet_id
        INNER JOIN reply 
        ON tweet.tweet_id = reply.tweet_id
        WHERE tweet.tweet_id=${tweetId};
        `;
      const tweetInsights = await dataBase.get(getTweetQuery);
      response.send(tweetInsights);
    }
  }
);

//user following tweet liked users

app.get(
  "/tweets/:tweetId/likes/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const tweetIdsOfFollowingQuery = `
    SELECT tweet.tweet_id
    FROM user INNER JOIN tweet
    ON user.user_id =tweet.user_id
    WHERE 
    user.user_id IN (
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id=${userId}
    )`;
    const followingTweetIds = await dataBase.all(tweetIdsOfFollowingQuery);
    intOfTweetId = parseInt(tweetId);
    resultList = followingTweetIds.map((eachObject) => eachObject.tweet_id);
    const result = resultList.includes(intOfTweetId);

    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikesOfTweetQuery = `
        SELECT user.name
        FROM user INNER JOIN like 
        ON user.user_id = like.user_id
        WHERE like.tweet_id=${tweetId};`;
      const getLikesOfTweet = await dataBase.all(getLikesOfTweetQuery);
      response.send({
        likes: getLikesOfTweet.map((eachObject) => eachObject.name),
      });
    }
  }
);

//user following tweet replies and names

app.get(
  "/tweets/:tweetId/replies/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const tweetIdsOfFollowingQuery = `
    SELECT tweet.tweet_id
    FROM user INNER JOIN tweet
    ON user.user_id =tweet.user_id
    WHERE 
    user.user_id IN (
        SELECT following_user_id 
        FROM follower
        WHERE follower_user_id=${userId}
    )`;
    const followingTweetIds = await dataBase.all(tweetIdsOfFollowingQuery);
    intOfTweetId = parseInt(tweetId);
    resultList = followingTweetIds.map((eachObject) => eachObject.tweet_id);
    const result = resultList.includes(intOfTweetId);

    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesOfTweetQuery = `
        SELECT user.name,
        reply.reply
        FROM user INNER JOIN reply 
        ON user.user_id = reply.user_id
        WHERE reply.tweet_id=${tweetId};`;
      const getRepliesOfTweet = await dataBase.all(getRepliesOfTweetQuery);
      response.send({
        replies: getRepliesOfTweet,
      });
    }
  }
);

//list of all tweets of user

app.get(
  "/user/tweets/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;

    const tweetsQuery = `
    SELECT tweet.tweet,
    COUNT(like.tweet_id) AS likes,
    COUNT(reply.tweet_id) AS replies,
    tweet.date_time AS dateTime
    FROM tweet INNER JOIN like
    ON tweet.user_id = like.user_id
    INNER JOIN reply 
    ON tweet.user_id = reply.user_id
    WHERE tweet.user_id=${userId};
    `;
    const tweets = await dataBase.all(tweetsQuery);
    response.send(tweets);
  }
);

//post tweet

app.post(
  "/user/tweets/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;
    const { tweet } = request.body;
    const dateTime = new Date();
    const postQuery = `
    INSERT 
    INTO tweet(tweet,user_id)
    VALUES(
        '${tweet}',
        ${userId}
    );`;
    await dataBase.run(postQuery);
    response.send("Created a Tweet");
  }
);

//DELETE THE TWEET

app.delete(
  "/tweets/:tweetId/",
  authenticateMiddlewareFunction,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetailsQuery = `
    SELECT user_id
    FROM user
    WHERE username = '${username}'`;
    const getUserId = await dataBase.get(getUserDetailsQuery);
    const userId = getUserId.user_id;

    const getTweetIdsQuery = `
    SELECT tweet_id 
    FROM tweet
    WHERE user_id =${userId};`;
    const getTweets = await dataBase.all(getTweetIdsQuery);
    const intOfTweetId = parseInt(tweetId);
    const resultList = getTweets.map((eachObject) => eachObject.tweet_id);
    const result = resultList.includes(intOfTweetId);

    if (result === false) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
        DELETE 
        FROM tweet
        WHERE user_id=${userId};`;
      await dataBase.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
