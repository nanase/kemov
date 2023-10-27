interface YouTubeThumbnail {
  url: string;
  width: number;
  height: number;
}

interface YouTubeStatistics {
  hiddenSubscriberCount: boolean;
  videoCount: number;
  viewCount: number;
  subscriberCount: number;
}

export interface YouTubeChannelStats {
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
  data: YouTubeChannelStats[];
}

export interface YouTubeChannel {
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
