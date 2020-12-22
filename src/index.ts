import { Rabbit } from "rabbit-queue";
import { addLeaderResponsibility } from "./pusher";
require("dotenv").config();

type RabbitAck = (error?: any, reply?: any) => any;
type Message = {
  msg: any;
  ack: RabbitAck;
};

const RATE_PER_SECOND = 2;

const QUEUE_NAME = "google.sheets";
const BINDING_KEY = QUEUE_NAME + ".*";

const MESSAGES: { [k: string]: Message } = {};

const TOKEN_BUCKET_QUEUE_NAME = "google.sheets.tokens";
const TOKEN_BUCKET_BINDING_KEY = TOKEN_BUCKET_QUEUE_NAME + ".*";

const TOKENS: { [k: string]: Message } = {};

const processMessage = (token: Message, message: Message, routingKey: string) => {
  console.log("Using token", token.msg.content.toString());
  console.log("processing message", message.msg.content.toString());

  delete MESSAGES[routingKey];
  delete TOKENS[routingKey];

  token.ack();
  message.ack();
};

const handleMessage = (msg: any, ack: RabbitAck) => {
  const routingKey = msg.fields.routingKey;

  const token = TOKENS[routingKey];
  if (!token) {
    console.log("No token found, caching message for", routingKey);
    MESSAGES[routingKey] = {
      msg,
      ack,
    };
    return;
  }

  processMessage(token, { msg, ack }, routingKey);
};

const handleToken = (msg: any, ack: RabbitAck, amqp: Rabbit) => {
  const routingKey = (msg.fields.routingKey || "").replace(/.tokens/g, "");

  const message = MESSAGES[routingKey];
  if (!message) {
    console.log("No messages found, caching token for", routingKey);
    TOKENS[routingKey] = {
      msg,
      ack,
    };
    return;
  }

  processMessage({ msg, ack }, message, routingKey);
};

const issueToken = (amqp: Rabbit) => {

  amqp.publishExchange(
    "amq.topic",
    "google.sheets.tokens.append",
    { token: new Date().toISOString() },
    { correlationId: "2", persistent: true }
  );
};

const createQueues = (amqp: Rabbit) => {
  // Main Queue
  amqp.createQueue(QUEUE_NAME, { durable: false }, handleMessage);
  amqp.bindToExchange(QUEUE_NAME, "amq.topic", BINDING_KEY);

  // Token queue
  amqp.createQueue(
    TOKEN_BUCKET_QUEUE_NAME,
    { durable: false, messageTtl: 1000, maxLength: RATE_PER_SECOND },
    (msg: any, ack: RabbitAck) => handleToken(msg, ack, amqp)
  );
  amqp.bindToExchange(TOKEN_BUCKET_QUEUE_NAME, "amq.topic", TOKEN_BUCKET_BINDING_KEY);

  setTimeout(() => {
    for (let i = 0; i < 100; i++) {
      amqp.publishExchange("amq.topic", "google.sheets.append", { test: "process this" }, { correlationId: "1" });
    }
  }, 2000)

  const queueTokens = () => setInterval(() => issueToken(amqp), 1000 / RATE_PER_SECOND)
  const clearTokenQueueing = (intervalId: NodeJS.Timeout) => clearInterval(intervalId)

  addLeaderResponsibility([queueTokens, clearTokenQueueing, null])
};

const start = () => {
  if (!process.env.AMQP_URL) {
    console.error("Add AMQP_URL env var");
    return;
  }

  const amqp = new Rabbit(process.env.AMQP_URL, {
    prefetch: 1,
  });

  amqp.on("connected", () => {
    createQueues(amqp);
  });

  amqp.on("disconnected", (err = new Error("amqp Disconnected")) => {
    console.error(err);
    setTimeout(() => amqp.reconnect(), 1000);
  });
};

start();
