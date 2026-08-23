import { messagingApi } from "@line/bot-sdk";

export function getLineMessagingClient(): messagingApi.MessagingApiClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  return new messagingApi.MessagingApiClient({
    channelAccessToken,
  });
}

export function getLineBlobClient(): messagingApi.MessagingApiBlobClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
  return new messagingApi.MessagingApiBlobClient({
    channelAccessToken,
  });
}

export const lineMessagingClient = getLineMessagingClient();
