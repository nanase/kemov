export interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface YouTubeStatistics {
  hiddenSubscriberCount: boolean;
  videoCount: number;
  viewCount: number;
  subscriberCount: number;
  videoCountPerHour: number;
  viewCountPerHour: number;
  subscriberCountPerHour: number;
  videoCountPerDay: number;
  viewCountPerDay: number;
  subscriberCountPerDay: number;
}

export interface YouTubeChannel {
  id: string;
  fullname: string;
  customUrl: string;
  thumbnails: {
    default: YouTubeThumbnail;
    medium: YouTubeThumbnail;
    high: YouTubeThumbnail;
  };
  statistics: YouTubeStatistics;
}

export interface YouTubeChannelStatsResponse {
  fetched_at: number;
  data: YouTubeChannel[];
}

export interface YouTubeStreamer {
  id: string;
  name: string;
  fullname: string;
  globalname?: string;
  twitter?: string;
  color: {
    key: string;
    sub: string;
    light: string;
    back: string;
  };
  activityStartDate: string;
  activityEndDate?: string;
}

export type YouTubeChannelStreamer = YouTubeStreamer & YouTubeChannel;
