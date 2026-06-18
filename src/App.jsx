import React, { useState, useEffect, useRef } from 'react';

// Backend host configuration
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API_PREFIX = '/api/v1';

const loadStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user')) || null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
};

const REQUEST_TIMEOUT_MS = 8000;
const FEED_PREFETCH_THRESHOLD = 3;
const MEDIA_PRELOAD_AHEAD = 2;
const PLAYBACK_SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2];

const FEATURED_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'game', label: '游戏', keyword: '游戏' },
  { id: 'anime', label: '二次元', keyword: '二次元' },
  { id: 'music', label: '音乐', keyword: '音乐' },
  { id: 'film', label: '影视', keyword: '影视' },
  { id: 'food', label: '美食', keyword: '美食' },
  { id: 'knowledge', label: '知识', keyword: '知识' },
  { id: 'theater', label: '小剧场', keyword: '小剧场' },
  { id: 'vlog', label: '生活vlog', keyword: '生活' },
  { id: 'sports', label: '体育', keyword: '运动' },
  { id: 'travel', label: '旅行', keyword: '旅行' },
  { id: 'tech', label: '科技', keyword: '科技' },
  { id: 'nature', label: '自然', keyword: '自然' },
  { id: 'creative', label: '创意', keyword: '创意' },
];

const formatVideoTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainSeconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainSeconds).padStart(2, '0')}`;
};

const formatLikeCount = (value) => {
  const num = Number(value) || 0;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}千`;
  return String(num);
};

const formatRelativeTime = (value) => {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  return `${Math.floor(months / 12)}年前`;
};

const estimateVideoDuration = (video) => {
  const seed = Number(video?.id) || 0;
  const totalSeconds = 45 + (seed % 240);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function App() {
  // --- STATE SYSTEM ---
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(loadStoredUser());
  const [isCheckingSession, setIsCheckingSession] = useState(!!localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // View switching: 'feed' (用户视频页) | 'admin' (管理员监控台) | 'profile' (用户主页)
  const [currentView, setCurrentView] = useState('feed');
  const [navTab, setNavTab] = useState('featured');

  // 精选页：分类 + 网格
  const [featuredCategory, setFeaturedCategory] = useState('all');
  const [featuredVideos, setFeaturedVideos] = useState([]);
  const [featuredPagination, setFeaturedPagination] = useState({ nextCursor: null, hasMore: false });
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const categoryBarRef = useRef(null);

  // Video feed state
  const [videos, setVideos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const [allViewed, setAllViewed] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [feedPagination, setFeedPagination] = useState({ nextCursor: null, hasMore: false });
  const [playTriggerAnim, setPlayTriggerAnim] = useState(false);
  const [likingVideoId, setLikingVideoId] = useState(null);
  const [favoritingVideoId, setFavoritingVideoId] = useState(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState(null);
  const [isVideoZoomed, setIsVideoZoomed] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [playbackProgress, setPlaybackProgress] = useState({ currentTime: 0, duration: 0 });
  const [followMap, setFollowMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef(null);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [activeFriend, setActiveFriend] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [followingUsers, setFollowingUsers] = useState([]);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(false);
  const [selectedFollowingUser, setSelectedFollowingUser] = useState(null);

  // Modals & Drawers state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLikeNotificationsOpen, setIsLikeNotificationsOpen] = useState(false);
  const [likeNotifications, setLikeNotifications] = useState([]);
  const [likeNotificationUnreadCount, setLikeNotificationUnreadCount] = useState(0);
  const [likeNotificationsPagination, setLikeNotificationsPagination] = useState({ nextCursor: null, hasMore: false });

  // Liked videos
  const [isLikedVideosOpen, setIsLikedVideosOpen] = useState(false);
  const [likedVideos, setLikedVideos] = useState([]);
  const [likedVideosPagination, setLikedVideosPagination] = useState({ nextCursor: null, hasMore: false });

  // Share to friend
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareTargetVideoId, setShareTargetVideoId] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  // Shared with me
  const [isSharedVideosOpen, setIsSharedVideosOpen] = useState(false);
  const [sharedVideos, setSharedVideos] = useState([]);
  const [sharedVideosPagination, setSharedVideosPagination] = useState({ nextCursor: null, hasMore: false });

  // Video comments
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentsVideoId, setCommentsVideoId] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsPagination, setCommentsPagination] = useState({ nextCursor: null, hasMore: false });
  const [commentsTotalCount, setCommentsTotalCount] = useState(0);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [targetCommentId, setTargetCommentId] = useState(null);
  const [isGeneratingCommentReply, setIsGeneratingCommentReply] = useState(false);
  const commentsListRef = useRef(null);

  // User profile page
  const [profileUserId, setProfileUserId] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileTab, setProfileTab] = useState('published');
  const [profileVideos, setProfileVideos] = useState([]);
  const [profileVideosPagination, setProfileVideosPagination] = useState({ nextCursor: null, hasMore: false });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileRelationModal, setProfileRelationModal] = useState(null);
  const [profileRelationUsers, setProfileRelationUsers] = useState([]);
  const [isLoadingProfileRelations, setIsLoadingProfileRelations] = useState(false);
  const [isUpdatingProfileMedia, setIsUpdatingProfileMedia] = useState(false);

  // Video upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadVideo, setUploadVideo] = useState(null);
  const [uploadCover, setUploadCover] = useState(null);
  const [uploadCoverPreview, setUploadCoverPreview] = useState('');
  const [aiCoverCandidates, setAiCoverCandidates] = useState([]);
  const [aiCoverSuggestion, setAiCoverSuggestion] = useState(null);
  const [isGeneratingCoverSuggestion, setIsGeneratingCoverSuggestion] = useState(false);
  const [aiCategorySuggestion, setAiCategorySuggestion] = useState(null);
  const [isGeneratingCategorySuggestion, setIsGeneratingCategorySuggestion] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');

  // Live Developer Stats & Logs dashboard
  const [devStats, setDevStats] = useState({ users: 0, videos: 0, likes: 0, views: 0, averageResponseTimeMs: 0, totalRequestsLogged: 0 });
  const [devLogs, setDevLogs] = useState([]);
  const [adminPanelTab, setAdminPanelTab] = useState('logs');
  const [databaseTables, setDatabaseTables] = useState([]);
  const [selectedDatabaseTable, setSelectedDatabaseTable] = useState('');
  const [databaseTableData, setDatabaseTableData] = useState(null);
  const [isLoadingDatabase, setIsLoadingDatabase] = useState(false);
  const [logDetailModal, setLogDetailModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  // Batch delete management on own profile page
  const [batchManageMode, setBatchManageMode] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState(new Set());

  // Danmaku & watch later
  const [danmakuEnabled, setDanmakuEnabled] = useState(true);
  const [danmakuList, setDanmakuList] = useState([]);
  const [activeDanmaku, setActiveDanmaku] = useState([]);
  const [danmakuDraft, setDanmakuDraft] = useState('');
  const [isPostingDanmaku, setIsPostingDanmaku] = useState(false);
  const [isDanmakuEmojiOpen, setIsDanmakuEmojiOpen] = useState(false);
  const [inWatchLater, setInWatchLater] = useState(false);
  const [watchLaterCount, setWatchLaterCount] = useState(0);
  const [watchLaterVideos, setWatchLaterVideos] = useState([]);
  const [watchLaterPagination, setWatchLaterPagination] = useState({ nextCursor: null, hasMore: false });
  const [isLoadingWatchLater, setIsLoadingWatchLater] = useState(false);

  // UI Toast message
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const videoRef = useRef(null);
  const scrollLockRef = useRef(false);
  const touchStartRef = useRef({ y: 0 });
  const videoStageRef = useRef(null);
  const loadingMoreFeedRef = useRef(false);
  const curatedFeedRef = useRef(false);
  const preloadedMediaRef = useRef([]);
  const shownDanmakuIdsRef = useRef(new Set());
  const lastTimeRef = useRef(0);
  const uploadCoverPreviewRef = useRef('');
  const aiCoverCandidatesRef = useRef([]);

  useEffect(() => {
    uploadCoverPreviewRef.current = uploadCoverPreview;
  }, [uploadCoverPreview]);

  useEffect(() => {
    aiCoverCandidatesRef.current = aiCoverCandidates;
  }, [aiCoverCandidates]);

  useEffect(() => {
    return () => {
      if (uploadCoverPreviewRef.current) {
        URL.revokeObjectURL(uploadCoverPreviewRef.current);
      }
      aiCoverCandidatesRef.current.forEach(item => item.url && URL.revokeObjectURL(item.url));
    };
  }, []);

  const DANMAKU_COLORS = ['#ffffff', '#ffeb3b', '#ff5252', '#69f0ae', '#40c4ff', '#ff80ab', '#b388ff'];
  const DANMAKU_EMOJIS = ['😀', '😂', '😍', '👍', '❤️', '🔥', '🎉', '💯', '😭', '🤣', '✨', '🥰', '😎', '🤔', '👏', '🙏'];

  const [searchPage, setSearchPage] = useState(false);
  const [searchPageQuery, setSearchPageQuery] = useState('');
  const [searchPageResults, setSearchPageResults] = useState(null);
  const [isSearchPageLoading, setIsSearchPageLoading] = useState(false);

  useEffect(() => {
    const el = videoStageRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [currentIndex, videos.length, allViewed, feedPagination, isLoadingMoreFeed]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setVideos([]);
      setCurrentView('feed');
      setNavTab('recommend');
    }
  }, [token, user]);

  useEffect(() => {
    if (token) {
      initializeAuthenticatedSession();
    }
  }, [token]);

  useEffect(() => {
    let intervalId;
    if (token && user?.role === 'ADMIN' && currentView === 'admin') {
      fetchDevDashboardData();
      fetchDatabaseTables();
      intervalId = setInterval(() => {
        fetchDevDashboardData();
        fetchDatabaseTables();
      }, 10000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [token, user?.role, currentView]);

  useEffect(() => {
    if (currentView === 'admin' && user?.role === 'ADMIN' && adminPanelTab === 'database' && selectedDatabaseTable) {
      fetchDatabaseTableData(selectedDatabaseTable);
    }
  }, [currentView, user?.role, adminPanelTab, selectedDatabaseTable]);

  useEffect(() => {
    let intervalId;
    if (token) {
      fetchLikeNotificationUnreadCount();
      fetchWatchLaterVideos();
      intervalId = setInterval(() => {
        fetchLikeNotificationUnreadCount();
      }, 15000);
    } else {
      setLikeNotificationUnreadCount(0);
      setLikeNotifications([]);
      setWatchLaterCount(0);
      setWatchLaterVideos([]);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (currentView !== 'feed') {
      if (videoRef.current) videoRef.current.pause();
      return;
    }
    if (videos.length > 0 && videoRef.current) {
      setPlaybackProgress({ currentTime: 0, duration: 0 });
      setIsPlaying(false);
      videoRef.current.load();
      videoRef.current.muted = isMuted;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
            .then(() => {
              setIsPlaying(true);
              recordVideoView(videos[currentIndex].id);
            })
            .catch(err => {
              console.log("Auto-play blocked by browser. Click to play manually.", err);
            });
      }
    }
  }, [currentIndex, videos, currentView]);

  useEffect(() => {
    if (currentView !== 'feed' || !videos[currentIndex]?.id) {
      setDanmakuList([]);
      setActiveDanmaku([]);
      shownDanmakuIdsRef.current = new Set();
      lastTimeRef.current = 0;
      return;
    }
    const videoId = videos[currentIndex].id;
    shownDanmakuIdsRef.current = new Set();
    lastTimeRef.current = 0;
    setActiveDanmaku([]);
    setIsDanmakuEmojiOpen(false);
    fetchDanmakuForVideo(videoId);
    if (token) {
      fetchWatchLaterStatus(videoId);
    } else {
      setInWatchLater(false);
    }
  }, [currentIndex, videos, currentView, token]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, currentIndex, videos]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!token || currentView !== 'feed' || videos.length === 0 || allViewed) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevVideo();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextVideo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [token, videos.length, allViewed, currentIndex, currentView, feedPagination, isLoadingMoreFeed]);

  useEffect(() => {
    if (navTab === 'featured' && token) {
      fetchFeaturedVideos(featuredCategory);
    } else if (navTab === 'friends' && token) {
      // 切换到朋友页：清空视频，加载朋友列表
      setVideos([]);
      setSelectedFollowingUser(null);
      fetchFriends();
    } else if (navTab === 'following' && token) {
      // 切换到关注页：清空视频，清空选中的用户，加载关注列表
      setVideos([]);
      setSelectedFollowingUser(null);
      fetchFollowing();
    } else if (navTab === 'recommend' && token) {
      if (curatedFeedRef.current) {
        return;
      }
      // 切换到推荐页：清空视频，重新加载推荐
      setVideos([]);
      setCurrentIndex(0);
      setAllViewed(false);
      setFeedPagination({ nextCursor: null, hasMore: false });
      fetchRecommendations();
    } else if (navTab === 'watchlater' && token) {
      fetchWatchLaterVideos();
    }
  }, [navTab, token]);

  useEffect(() => {
    const vid = videos[currentIndex];
    if (!vid || !vid.user_id || vid.user_id === user?.id) return;
    if (followMap[vid.user_id] === undefined) fetchRelation(vid.user_id);
  }, [currentIndex, videos]);

  useEffect(() => {
    const handleClickOutside = (e) => {

      const searchWrap = document.querySelector('.header-search-wrap');
      if (searchWrap && !searchWrap.contains(e.target) && !searchPage) {
        setSearchResults(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [searchPage]);

  const showToast = (message, isError = false) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, isError });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  const normalizeFeedVideo = (video) => {
    if (!video) return video;
    const liked = typeof video.liked === 'boolean' ? video.liked : (video.is_liked === 1 || video.is_liked === true);
    const likeCount = video.likeCount ?? video.likes_count ?? video.likesCount ?? 0;
    const commentCount = video.commentCount ?? video.comments_count ?? 0;
    const favorited = typeof video.favorited === 'boolean' ? video.favorited : (video.is_favorited === 1 || video.is_favorited === true);
    const favoriteCount = video.favoriteCount ?? video.favorites_count ?? video.favoritesCount ?? 0;
    return {
      ...video,
      liked,
      likeCount,
      commentCount,
      favorited,
      favoriteCount,
      comments_count: commentCount,
      is_liked: liked ? 1 : 0,
      likes_count: likeCount,
      likesCount: likeCount,
      is_favorited: favorited ? 1 : 0,
      favorites_count: favoriteCount,
      favoritesCount: favoriteCount,
    };
  };

  const updateVideoLikeState = (videoId, liked, likeCount) => {
    setVideos(prev => prev.map(v => {
      if (v.id !== videoId) return v;
      return normalizeFeedVideo({ ...v, liked, likeCount });
    }));
    setProfileVideos(prev => prev.map(v => {
      if (v.id !== videoId) return v;
      return normalizeFeedVideo({ ...v, liked, likeCount });
    }));
  };

  const updateVideoFavoriteState = (videoId, favorited, favoriteCount) => {
    const patch = (v) => v.id === videoId
        ? normalizeFeedVideo({ ...v, favorited, favoriteCount })
        : v;
    setVideos(prev => prev.map(patch));
    setProfileVideos(prev => prev.map(patch));
  };

  const updateVideoCommentCount = (videoId, commentCount) => {
    const patch = (v) => v.id === videoId
        ? { ...v, comments_count: commentCount, commentCount }
        : v;
    setVideos(prev => prev.map(patch));
    setProfileVideos(prev => prev.map(patch));
  };

  const getAvatarUrl = (userOrSeed) => {
    if (userOrSeed && typeof userOrSeed === 'object') {
      if (userOrSeed.avatarUrl) return getMediaUrl(userOrSeed.avatarUrl);
      if (userOrSeed.creatorAvatarUrl) return getMediaUrl(userOrSeed.creatorAvatarUrl);
      const seed = userOrSeed.username || userOrSeed.displayName || 'user';
      return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    }
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${userOrSeed || 'user'}`;
  };

  const getProfileBackgroundUrl = (profile) => {
    if (!profile?.profileBackgroundUrl) return '';
    return getMediaUrl(profile.profileBackgroundUrl);
  };

  const getMediaUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_BASE}${url}`;
  };

  const apiFetch = async (endpoint, options = {}) => {
    const { silent = false, timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
    const headers = { ...fetchOptions.headers };
    const controller = new AbortController();
    const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (!(fetchOptions.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
        signal: controller.signal
      });
      if (response.status === 401) {
        setToken('');
        setUser(null);
        setIsCheckingSession(false);
        showToast('登录会话已过期，请重新登录', true);
        return null;
      }
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (err) {
      if (!silent) {
        showToast(err.name === 'AbortError' ? `请求超时：${endpoint}` : '网络请求失败，请确保后端服务已启动！', true);
        console.error(endpoint, err);
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const initializeAuthenticatedSession = async () => {
    setIsCheckingSession(true);
    try {
      const currentUser = await fetchCurrentUser();
      if (currentUser) {
        Promise.allSettled([
          navTab === 'featured' ? fetchFeaturedVideos(featuredCategory) : fetchRecommendations(),
          fetchLikeNotificationUnreadCount()
        ]);
      }
    } finally {
      setIsCheckingSession(false);
    }
  };

  const fetchCurrentUser = async () => {
    const data = await apiFetch(`${API_PREFIX}/users/me`);
    if (data && data.success) {
      setUser(data.user);
      return data.user;
    }
    return null;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showToast('请填写完整用户名和密码！', true);
      return;
    }
    const endpoint = authMode === 'register' ? `${API_PREFIX}/registrations` : `${API_PREFIX}/sessions`;
    const data = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (data) {
      if (data.success) {
        setToken(data.token);
        setUser(data.user);
        showToast(data.message);
        setUsername('');
        setPassword('');
      } else {
        showToast(data.message, true);
      }
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm("⚠️ 确定要彻底注销账户吗？这将会删除您所有的发布视频且不可恢复！")) {
      return;
    }
    const data = await apiFetch(`${API_PREFIX}/users/me`, { method: 'DELETE' });
    if (data && data.success) {
      setToken('');
      setUser(null);
      showToast(data.message);
    }
  };

  const fetchRecommendations = async (cursor = null, append = false) => {
    if (append) {
      if (loadingMoreFeedRef.current) return false;
      loadingMoreFeedRef.current = true;
      setIsLoadingMoreFeed(true);
    } else {
      loadingMoreFeedRef.current = false;
      setIsLoadingFeed(true);
    }
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/video-recommendations?limit=10${cursorParam}`);
    if (append) {
      loadingMoreFeedRef.current = false;
      setIsLoadingMoreFeed(false);
    } else {
      setIsLoadingFeed(false);
    }
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      if (!append && curatedFeedRef.current) {
        return fetchedVideos.length > 0;
      }
      setVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setAllViewed(append ? false : data.allViewed);
      setTotalCount(data.totalCount);
      setFeedPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
      if (!append) {
        setCurrentIndex(0);
      }
      return fetchedVideos.length > 0;
    }
    return false;
  };

  const fetchFeaturedVideos = async (categoryId = featuredCategory, cursor = null, append = false) => {
    setIsLoadingFeatured(true);
    const category = FEATURED_CATEGORIES.find((item) => item.id === categoryId) || FEATURED_CATEGORIES[0];
    let data;
    if (categoryId === 'all') {
      const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
      data = await apiFetch(`${API_PREFIX}/featured-videos?limit=24${cursorParam}`);
      if ((!data || !data.success) && !append) {
        const fallback = await apiFetch(`${API_PREFIX}/video-recommendations?limit=24`);
        if (fallback && fallback.success) {
          data = fallback;
        }
      }
    } else {
      data = await apiFetch(`${API_PREFIX}/videos?q=${encodeURIComponent(category.keyword || category.label)}`);
    }
    setIsLoadingFeatured(false);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setFeaturedVideos((prev) => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      if (categoryId === 'all') {
        setFeaturedPagination({
          nextCursor: data.pagination?.nextCursor ?? null,
          hasMore: data.pagination?.hasMore ?? false,
        });
      } else {
        setFeaturedPagination({ nextCursor: null, hasMore: false });
      }
      return fetchedVideos.length > 0;
    }
    if (!append) {
      setFeaturedVideos([]);
      setFeaturedPagination({ nextCursor: null, hasMore: false });
      if (categoryId === 'all') {
        showToast(data?.message || '精选视频加载失败，请确认后端已重启', true);
      }
    }
    return false;
  };

  const switchFeaturedCategory = async (categoryId) => {
    if (categoryId === featuredCategory) return;
    setFeaturedCategory(categoryId);
    await fetchFeaturedVideos(categoryId);
  };

  const scrollFeaturedCategories = (direction) => {
    if (!categoryBarRef.current) return;
    categoryBarRef.current.scrollBy({ left: direction * 220, behavior: 'smooth' });
  };

  const handlePlayFeaturedVideo = (videoItem, index) => {
    startSingleVideoPlayback(videoItem, {
      queue: featuredVideos,
      startIndex: index >= 0 ? index : 0,
    });
  };

  const handlePlayWatchLaterVideo = (videoItem, index) => {
    startSingleVideoPlayback(videoItem, {
      queue: watchLaterVideos,
      startIndex: index >= 0 ? index : 0,
    });
  };

  const openWatchLaterTab = () => {
    if (!token) {
      showToast('请先登录', true);
      return;
    }
    curatedFeedRef.current = false;
    setCurrentView('feed');
    setNavTab('watchlater');
  };

  const recordVideoView = async (videoId) => {
    await apiFetch(`${API_PREFIX}/videos/${videoId}/views`, { method: 'POST', silent: true, timeoutMs: 15000 });
  };

  const handleToggleLike = async (videoId, e) => {
    e?.stopPropagation();
    if (!token) {
      showToast('请先登录后再点赞', true);
      return;
    }
    if (likingVideoId === videoId) {
      return;
    }
    setLikingVideoId(videoId);
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/likes/me`, { method: 'PUT' });
    setLikingVideoId(null);
    if (!data) return;
    if (data.success) {
      const liked = Boolean(data.liked);
      const likeCount = data.likeCount ?? data.likes_count ?? 0;
      updateVideoLikeState(videoId, liked, likeCount);
      showToast(liked ? '已点赞' : '已取消点赞');
    } else {
      showToast(data.message || '点赞操作失败', true);
    }
  };

  const handleToggleFavorite = async (videoId, e) => {
    e?.stopPropagation();
    if (!token) {
      showToast('请先登录后再收藏', true);
      return;
    }
    if (favoritingVideoId === videoId) {
      return;
    }
    setFavoritingVideoId(videoId);
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/favorites/me`, { method: 'PUT' });
    setFavoritingVideoId(null);
    if (!data) return;
    if (data.success) {
      const favorited = Boolean(data.favorited);
      const favoriteCount = data.favoriteCount ?? data.favorites_count ?? 0;
      updateVideoFavoriteState(videoId, favorited, favoriteCount);
      showToast(favorited ? '已收藏' : '已取消收藏');
      if (currentView === 'profile' && profileUserId === user?.id && profileTab === 'favorited') {
        if (!favorited) {
          setProfileVideos(prev => prev.filter(v => v.id !== videoId));
        }
      }
    } else {
      showToast(data.message || '收藏操作失败', true);
    }
  };

  const handleResetViews = async () => {
    const data = await apiFetch(`${API_PREFIX}/users/me/views`, { method: 'DELETE', timeoutMs: 60000 });
    if (data && data.success) {
      showToast(data.message);
      loadingMoreFeedRef.current = false;
      setIsLoadingMoreFeed(false);
      setFeedPagination({ nextCursor: null, hasMore: false });
      setAllViewed(false);
      setCurrentIndex(0);
      setVideos([]);
      await fetchRecommendations();
    }
  };

  const parseDownloadFilename = (contentDisposition, fallback) => {
    if (!contentDisposition) return fallback;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1].trim());
      } catch {
        return fallback;
      }
    }
    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return plainMatch ? plainMatch[1].trim() : fallback;
  };

  const isValidVideoBlob = async (blob) => {
    if (!blob || blob.size < 1024) return false;
    const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const isMp4 = header.length >= 8
      && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70;
    const isWebm = header.length >= 4
      && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    return isMp4 || isWebm || (blob.type.startsWith('video/') && blob.size > 10000);
  };

  const saveVideoBlob = (blob, filename) => {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  const handleDownloadVideo = async (video, e) => {
    e?.stopPropagation();
    if (!token) {
      showToast('请先登录后再下载', true);
      return;
    }
    if (!video?.id || downloadingVideoId === video.id) return;

    const sourceUrl = video.video_url || '';
    const fallbackName = `${(video.title || 'video').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}_${video.id}.mp4`;
    const isExternalUrl = sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://');

    const fetchFromApi = async (signal) => {
      const response = await fetch(`${API_BASE}${API_PREFIX}/videos/${video.id}/file`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) {
        let message = '视频下载失败，请稍后重试';
        try {
          const errData = await response.json();
          if (errData?.message) message = errData.message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        try {
          const errData = JSON.parse(await blob.text());
          throw new Error(errData?.message || '视频下载失败，请稍后重试');
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          throw new Error('视频下载失败，请稍后重试');
        }
      }
      if (!(await isValidVideoBlob(blob))) {
        throw new Error('视频文件不存在或已损坏');
      }
      return {
        blob,
        filename: parseDownloadFilename(response.headers.get('Content-Disposition'), fallbackName),
      };
    };

    const fetchFromCdn = async (signal) => {
      const response = await fetch(getMediaUrl(sourceUrl), { signal });
      if (!response.ok) throw new Error('direct fetch failed');
      const blob = await response.blob();
      if (!(await isValidVideoBlob(blob))) throw new Error('视频文件无法访问');
      return { blob, filename: fallbackName };
    };

    setDownloadingVideoId(video.id);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      const strategies = sourceUrl.startsWith('/uploads/')
        ? [fetchFromApi]
        : isExternalUrl
          ? [fetchFromCdn, fetchFromApi]
          : [];

      if (strategies.length === 0) {
        throw new Error('视频地址无效');
      }

      let saved = false;
      for (const strategy of strategies) {
        try {
          const result = await strategy(controller.signal);
          saveVideoBlob(result.blob, result.filename);
          saved = true;
          break;
        } catch (strategyErr) {
          console.warn('download strategy failed', strategyErr);
        }
      }
      clearTimeout(timeoutId);

      if (saved) {
        showToast('视频已保存到本地');
        return;
      }

      if (isExternalUrl) {
        const link = document.createElement('a');
        link.href = getMediaUrl(sourceUrl);
        link.download = fallbackName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('已交由浏览器下载，请稍后在「下载」文件夹查看');
        return;
      }

      throw new Error('视频下载失败，请稍后重试');
    } catch (err) {
      console.error(err);
      showToast(err.message || '视频下载失败，请稍后重试', true);
    } finally {
      setDownloadingVideoId(null);
    }
  };

  const fetchDanmakuForVideo = async (videoId) => {
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/danmaku`, { silent: true });
    if (data && data.success) {
      setDanmakuList(data.danmaku || []);
    } else {
      setDanmakuList([]);
    }
  };

  const fetchWatchLaterStatus = async (videoId) => {
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/watch-later-items/me`, { silent: true });
    if (data && data.success) {
      setInWatchLater(!!data.inWatchLater);
      setWatchLaterCount(data.watchLaterCount ?? 0);
    }
  };

  const fetchWatchLaterVideos = async (cursor = null, append = false) => {
    if (!token) return;
    setIsLoadingWatchLater(true);
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/watch-later-items/videos?limit=24${cursorParam}`);
    setIsLoadingWatchLater(false);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setWatchLaterVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setWatchLaterPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
      if (typeof data.totalCount === 'number') {
        setWatchLaterCount(data.totalCount);
      }
    }
  };

  const toggleWatchLater = async (videoId, e) => {
    e?.stopPropagation();
    if (!token) {
      showToast('请先登录', true);
      return;
    }
    const endpoint = `${API_PREFIX}/videos/${videoId}/watch-later-items/me`;
    const data = inWatchLater
        ? await apiFetch(endpoint, { method: 'DELETE' })
        : await apiFetch(endpoint, { method: 'POST' });
    if (data && data.success) {
      setInWatchLater(!!data.inWatchLater);
      setWatchLaterCount(data.watchLaterCount ?? watchLaterCount);
      showToast(data.inWatchLater ? '已添加至稍后再看' : '已从稍后再看移除');
      if (navTab === 'watchlater') {
        await fetchWatchLaterVideos();
      }
    } else if (data) {
      showToast(data.message || '操作失败', true);
    }
  };

  const handlePostDanmaku = async (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    const content = danmakuDraft.trim();
    if (!content || !activeVideo?.id || isPostingDanmaku) return;
    if (!token) {
      showToast('请先登录', true);
      return;
    }
    const appearAt = videoRef.current?.currentTime ?? 0;
    setIsPostingDanmaku(true);
    const color = DANMAKU_COLORS[Math.floor(Math.random() * DANMAKU_COLORS.length)];
    const data = await apiFetch(`${API_PREFIX}/videos/${activeVideo.id}/danmaku`, {
      method: 'POST',
      body: JSON.stringify({ content, appearAt, color })
    });
    setIsPostingDanmaku(false);
    if (data && data.success) {
      setDanmakuDraft('');
      if (data.danmaku) {
        setDanmakuList(prev => [...prev, data.danmaku].sort((a, b) => a.appearAt - b.appearAt));
        pushDanmakuItem(data.danmaku);
      } else {
        await fetchDanmakuForVideo(activeVideo.id);
      }
      showToast('弹幕发送成功');
    } else if (data) {
      showToast(data.message || '弹幕发送失败', true);
    }
  };

  const pushDanmakuItem = (item) => {
    if (!item || shownDanmakuIdsRef.current.has(item.id)) return;
    shownDanmakuIdsRef.current.add(item.id);
    const track = Math.floor(Math.random() * 8);
    const key = `${item.id}-${Date.now()}-${Math.random()}`;
    setActiveDanmaku(prev => [...prev, { ...item, key, track }]);
    window.setTimeout(() => {
      setActiveDanmaku(prev => prev.filter(d => d.key !== key));
    }, 9000);
  };

  const spawnDanmakuAtCurrentTime = (currentTime) => {
    if (!danmakuEnabled || danmakuList.length === 0) return;
    const dueItems = danmakuList.filter((item) => {
      const appearAt = Number(item.appearAt ?? item.appear_at ?? 0);
      return Math.abs(appearAt - currentTime) < 0.35 && !shownDanmakuIdsRef.current.has(item.id);
    });
    dueItems.forEach((item) => {
      pushDanmakuItem(item);
    });
  };

  const appendDanmakuEmoji = (emoji) => {
    setDanmakuDraft((prev) => {
      const next = `${prev}${emoji}`;
      return next.length > 100 ? next.slice(0, 100) : next;
    });
    setIsDanmakuEmojiOpen(false);
  };

  const renderVideoPlayerExtras = () => (
    <>
      {danmakuEnabled && (
        <div className="danmaku-layer" onClick={(e) => e.stopPropagation()}>
          {activeDanmaku.map((item) => (
            <span
              key={item.key}
              className="danmaku-item"
              style={{
                top: `${8 + item.track * 6}%`,
                color: item.color || '#fff',
                animationDuration: `${7 + (item.track % 3)}s`
              }}
            >
              {item.content}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`watch-later-overlay-btn ${inWatchLater ? 'active' : ''}`}
        onClick={(e) => toggleWatchLater(activeVideo.id, e)}
        title={inWatchLater ? '已在稍后再看' : '添加至稍后再看'}
      >
        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
        <span>{inWatchLater ? '已在稍后再看' : '添加至稍后再看'}</span>
      </button>
      <div className="web-video-bottom-dock" onClick={(e) => e.stopPropagation()}>
        <form className="danmaku-compose-bar" onSubmit={handlePostDanmaku}>
          <button
            type="button"
            className="danmaku-emoji-btn"
            onClick={() => setIsDanmakuEmojiOpen(prev => !prev)}
            title="添加表情"
            aria-label="添加表情"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </button>
          {isDanmakuEmojiOpen && (
            <div className="danmaku-emoji-picker" role="listbox" aria-label="选择表情">
              {DANMAKU_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="danmaku-emoji-item"
                  onClick={() => appendDanmakuEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder="发一条友好的弹幕吧"
            value={danmakuDraft}
            onChange={(e) => setDanmakuDraft(e.target.value)}
            onFocus={() => setIsDanmakuEmojiOpen(false)}
            maxLength={100}
            disabled={isPostingDanmaku}
          />
          <button
            type="submit"
            className="danmaku-send-btn"
            disabled={isPostingDanmaku || !danmakuDraft.trim()}
          >
            {isPostingDanmaku ? '发送中' : '发送'}
          </button>
        </form>
        <button
          type="button"
          className={`danmaku-toggle-btn ${danmakuEnabled ? 'active' : ''}`}
          onClick={() => setDanmakuEnabled(prev => !prev)}
          title={danmakuEnabled ? '关闭弹幕' : '开启弹幕'}
          aria-label={danmakuEnabled ? '关闭弹幕' : '开启弹幕'}
        >
          <span className="danmaku-toggle-icon">弹</span>
        </button>
      </div>
    </>
  );

  const renderDownloadButton = (video) => (
    <button
      className={`action-item-button special-action ${downloadingVideoId === video.id ? 'is-loading' : ''}`}
      onClick={(e) => handleDownloadVideo(video, e)}
      disabled={downloadingVideoId === video.id}
      title="下载到本地"
    >
      <div className="action-icon-circle">
        <svg viewBox="0 0 24 24">
          <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
        </svg>
      </div>
      <span className="action-count">{downloadingVideoId === video.id ? '下载中' : '下载'}</span>
    </button>
  );

  const fetchDevDashboardData = async () => {
    const statsData = await apiFetch(`${API_PREFIX}/admin/stats`, { silent: true, timeoutMs: 15000 });
    if (statsData && statsData.success) {
      setDevStats(statsData.stats);
    }
    const logsData = await apiFetch(`${API_PREFIX}/admin/request-logs`, { silent: true, timeoutMs: 15000 });
    if (logsData && logsData.success) {
      setDevLogs(logsData.logs || []);
    }
  };

  const fetchDatabaseTables = async () => {
    const data = await apiFetch(`${API_PREFIX}/admin/database/tables`, { silent: true, timeoutMs: 15000 });
    if (data && data.success) {
      setDatabaseTables(data.tables || []);
      if (!selectedDatabaseTable && (data.tables || []).length > 0) {
        setSelectedDatabaseTable(data.tables[0].name);
      }
    }
  };

  const fetchDatabaseTableData = async (tableName, offset = 0) => {
    if (!tableName) return;
    setIsLoadingDatabase(true);
    const data = await apiFetch(`${API_PREFIX}/admin/database/tables/${encodeURIComponent(tableName)}?limit=50&offset=${offset}`, {
      silent: true,
      timeoutMs: 15000
    });
    setIsLoadingDatabase(false);
    if (data && data.success) {
      setDatabaseTableData(data);
    }
  };

  const fetchLikedVideos = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/likes/videos?limit=8${cursorParam}`);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setLikedVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setLikedVideosPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const searchUsers = async (query) => {
    if (!query.trim()) {
      setUserSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    const data = await apiFetch(`${API_PREFIX}/users?q=${encodeURIComponent(query.trim())}`);
    setIsSearchingUsers(false);
    if (data && data.success) {
      setUserSearchResults(data.users || []);
    }
  };

  const shareVideoToUser = async (toUserId) => {
    setIsSharing(true);
    const data = await apiFetch(`${API_PREFIX}/videos/${shareTargetVideoId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ toUserId }),
      headers: { 'Content-Type': 'application/json' }
    });
    setIsSharing(false);
    if (data && data.success) {
      showToast('视频分享成功！');
      setIsShareOpen(false);
      setUserSearchQuery('');
      setUserSearchResults([]);
      if (activeFriend?.id === toUserId) {
        await openFriendChat(activeFriend);
      }
    } else if (data) {
      showToast(data.message || '分享失败', true);
    }
  };

  const fetchSharedVideos = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/shares/videos?limit=8${cursorParam}`);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setSharedVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setSharedVideosPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const fetchLikeNotificationUnreadCount = async () => {
    const data = await apiFetch(`${API_PREFIX}/users/me/like-notifications?limit=1`);
    if (data && data.success) {
      setLikeNotificationUnreadCount(data.unreadCount ?? 0);
    }
  };

  const fetchLikeNotifications = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/like-notifications?limit=10${cursorParam}`);
    if (data && data.success) {
      setLikeNotifications(prev => append ? [...prev, ...(data.notifications || [])] : data.notifications || []);
      setLikeNotificationUnreadCount(data.unreadCount ?? 0);
      setLikeNotificationsPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const markLikeNotificationsRead = async () => {
    const data = await apiFetch(`${API_PREFIX}/users/me/like-notifications/read-receipts`, { method: 'PUT' });
    if (data && data.success) {
      setLikeNotificationUnreadCount(0);
      setLikeNotifications(prev => prev.map(item => ({ ...item, read: true })));
    }
  };

  const openLikeNotificationsPanel = async () => {
    setIsLikeNotificationsOpen(true);
    await fetchLikeNotifications();
    await markLikeNotificationsRead();
  };

  const findLoadedVideoById = (videoId) => {
    if (!videoId) return null;
    const allLoadedVideos = [
      ...videos,
      ...featuredVideos,
      ...profileVideos,
      ...likedVideos,
      ...sharedVideos,
      ...watchLaterVideos,
    ];
    return allLoadedVideos.find(video => video?.id === videoId) || null;
  };

  const openCommentsPanel = async (videoId, options = {}) => {
    const targetId = options.targetCommentId ?? null;
    setCommentsVideoId(videoId);
    setIsCommentsOpen(true);
    setCommentDraft('');
    setReplyTarget(null);
    setComments([]);
    setTargetCommentId(targetId);
    let data = await fetchComments(videoId);
    let attempts = 0;
    while (
      targetId &&
      data?.success &&
      data.pagination?.hasMore &&
      !(data.comments || []).some(item => item.id === targetId) &&
      attempts < 5
    ) {
      data = await fetchComments(videoId, data.pagination.nextCursor, true);
      attempts += 1;
    }
  };

  const getNotificationCommentId = (notification) => {
    if (notification?.commentId) return Number(notification.commentId);
    if (notification?.parentCommentId) return Number(notification.parentCommentId);
    if (typeof notification?.likeId === 'string' && notification.likeId.startsWith('C-')) {
      const id = Number(notification.likeId.slice(2));
      return Number.isFinite(id) ? id : null;
    }
    if (typeof notification?.likeId === 'string' && notification.likeId.startsWith('R-')) {
      const id = Number(notification.likeId.slice(2));
      return Number.isFinite(id) ? id : null;
    }
    return null;
  };

  const handleNotificationClick = async (notification) => {
    if (notification.type !== 'comment' && notification.type !== 'reply') return;
    if (!notification.videoId) {
      showToast('无法定位评论：通知缺少视频信息', true);
      return;
    }
    const commentId = getNotificationCommentId(notification);
    let targetVideo = findLoadedVideoById(notification.videoId);
    if (!targetVideo && notification.videoTitle) {
      const searchData = await apiFetch(`${API_PREFIX}/videos?q=${encodeURIComponent(notification.videoTitle)}`, { silent: true });
      const searchVideos = (searchData?.videos || []).map(normalizeFeedVideo);
      targetVideo = searchVideos.find(video => video?.id === notification.videoId)
        || searchVideos.find(video => video?.title === notification.videoTitle)
        || searchVideos[0]
        || null;
    }
    if (!targetVideo) {
      showToast('无法定位评论对应的视频', true);
      return;
    }
    startSingleVideoPlayback(targetVideo);
    setIsLikeNotificationsOpen(false);
    await openCommentsPanel(targetVideo.id, { targetCommentId: commentId });
  };

  const fetchComments = async (videoId, cursor = null, append = false) => {
    setIsLoadingComments(true);
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/comments?limit=20&_t=${Date.now()}${cursorParam}`);
    setIsLoadingComments(false);
    if (data && data.success) {
      setComments(prev => {
        const fetched = data.comments || [];
        if (append) {
          const uniqueFetched = fetched.filter(fItem => !prev.some(pItem => pItem.id === fItem.id));
          return [...prev, ...uniqueFetched];
        } else {
          const pendingLocal = prev.filter(pItem =>
              pItem.pending && pItem.videoId === videoId && !fetched.some(fItem => fItem.id === pItem.id)
          );
          return [...pendingLocal, ...fetched];
        }
      });
      setCommentsTotalCount(data.totalCount ?? 0);
      setCommentsPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
    return data;
  };

  useEffect(() => {
    if (!isCommentsOpen || !targetCommentId) return;
    const targetEl = commentsListRef.current?.querySelector(`[data-comment-id="${targetCommentId}"]`);
    if (!targetEl) return;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => setTargetCommentId(null), 2500);
    return () => clearTimeout(timer);
  }, [isCommentsOpen, comments, targetCommentId]);

  const handlePostComment = async (e) => {
    e?.preventDefault();
    const content = commentDraft.trim();
    const targetVideoId = commentsVideoId || activeVideo?.id;
    if (!content || !targetVideoId || isPostingComment) {
      if (content && !targetVideoId) {
        showToast('评论失败：没有找到当前视频', true);
      }
      return;
    }

    showToast('正在发送评论...');

    setIsPostingComment(true);
    const data = await apiFetch(`${API_PREFIX}/videos/${targetVideoId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        parentId: replyTarget?.id ?? null
      })
    });
    setIsPostingComment(false);

    if (data && data.success) {
      const newCount = data.commentsCount ?? commentsTotalCount + 1;
      console.log('[handlePostComment] success, data.comment:', data.comment, 'data.commentsCount:', data.commentsCount);
      setCommentDraft('');
      setReplyTarget(null);
      setCommentsTotalCount(newCount);
      updateVideoCommentCount(targetVideoId, newCount);
      setCommentsPagination({ nextCursor: null, hasMore: false });
      if (data.comment) {
        setComments(prev => {
          const postedComment = { ...data.comment, justPosted: true, replies: data.comment.replies || [] };
          const rootCommentId = replyTarget?.rootCommentId ?? postedComment.parentId;
          const next = postedComment.parentId
            ? prev.map(item => item.id === rootCommentId
              ? { ...item, replies: [...(item.replies || []), postedComment] }
              : item)
            : [
              postedComment,
              ...prev.filter(item => item.id !== postedComment.id)
            ];
          console.log('[handlePostComment] setComments, prev length:', prev.length, 'next length:', next.length);
          return next;
        });
        requestAnimationFrame(() => {
          if (data.comment.parentId) {
            commentsListRef.current
              ?.querySelector(`[data-comment-id="${data.comment.id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            commentsListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          }
        });
      } else {
        console.log('[handlePostComment] data.comment missing, re-fetching');
        await fetchComments(targetVideoId);
      }
      showToast('评论发表成功');
    } else if (data) {
      console.log('[handlePostComment] API failed, data:', data);
      showToast(data.message || '评论失败', true);
    } else {
      console.log('[handlePostComment] API call returned null');
      showToast('评论失败：请求没有发送成功', true);
    }
  };

  const handleGenerateCommentReply = async () => {
    if (!commentDraft.trim()) {
      showToast('先输入评论内容再润色', true);
      return;
    }
    setIsGeneratingCommentReply(true);
    try {
      const targetVideo = findLoadedVideoById(commentsVideoId || activeVideo?.id);
      const data = await apiFetch(`${API_PREFIX}/ai/comment-reply`, {
        method: 'POST',
        body: JSON.stringify({
          videoTitle: targetVideo?.title || '',
          comment: commentDraft,
          style: '自然'
        }),
        timeoutMs: 180000,
      });
      if (data && data.success) {
        const reply = data.reply || {};
        const polished = reply.polished || reply.reply;
        if (polished) {
          setCommentDraft(polished);
          showToast('已润色评论');
        }
      } else if (data) {
        showToast(data.message || 'AI 润色失败', true);
      }
    } finally {
      setIsGeneratingCommentReply(false);
    }
  };

  const startReplyingToComment = (comment, rootComment = null) => {
    const root = rootComment || comment;
    setReplyTarget({
      ...comment,
      rootCommentId: root.id,
      rootUsername: root.username,
    });
    setCommentDraft('');
  };

  const cancelReply = () => {
    setReplyTarget(null);
    setCommentDraft('');
  };

  const resetBatchManage = () => {
    setBatchManageMode(false);
    setSelectedVideoIds(new Set());
  };

  const isOwnPublishedProfile = profileUserId === user?.id && profileTab === 'published';

  const refreshOwnPublishedProfile = async () => {
    if (!user?.id) return;
    await fetchProfileVideos('published', user.id);
    await fetchUserProfile(user.id);
  };

  const openUserProfile = async (userId) => {
    if (!userId) return;
    resetBatchManage();
    setProfileUserId(userId);
    setProfileTab('published');
    setProfileVideos([]);
    setProfileVideosPagination({ nextCursor: null, hasMore: false });
    setProfileUser(null);
    setCurrentView('profile');
    setIsLoadingProfile(true);
    await fetchUserProfile(userId);
    if (userId !== user?.id) {
      await fetchRelation(userId);
    }
    await fetchProfileVideos('published', userId);
    setIsLoadingProfile(false);
  };

  const openMyProfile = () => {
    if (!user?.id) {
      showToast('请先登录', true);
      return;
    }
    setNavTab('mine');
    openUserProfile(user.id);
  };

  const closeUserProfile = () => {
    resetBatchManage();
    setCurrentView('feed');
    if (navTab === 'mine') {
      setNavTab('recommend');
    }
    setBatchManageMode(false);
    setSelectedVideoIds(new Set());
    setProfileUserId(null);
    setProfileUser(null);
    setProfileVideos([]);
  };

  const fetchUserProfile = async (userId) => {
    const data = await apiFetch(`${API_PREFIX}/users/${userId}`);
    if (data && data.success) {
      let nextProfileUser = data.user;
      if (userId === user?.id) {
        const relationData = await apiFetch(`${API_PREFIX}/users/me/relationships/${userId}`, { silent: true });
        if (relationData && relationData.success) {
          nextProfileUser = {
            ...nextProfileUser,
            followingCount: relationData.followingCount ?? nextProfileUser.followingCount,
            followerCount: relationData.followerCount ?? nextProfileUser.followerCount,
            friendCount: relationData.friendCount ?? nextProfileUser.friendCount,
          };
        }
      }
      setProfileUser(nextProfileUser);
    } else {
      showToast(data?.message || '无法加载用户资料', true);
    }
  };

  const openProfileRelationModal = async (type) => {
    if (profileUserId !== user?.id) {
      showToast('当前只能查看自己的关注、粉丝和朋友', true);
      return;
    }
    setProfileRelationModal(type);
    setProfileRelationUsers([]);
    setIsLoadingProfileRelations(true);
    if (type === 'friends') {
      const data = await apiFetch(`${API_PREFIX}/users/me/relationships/friends`);
      setIsLoadingProfileRelations(false);
      if (data && data.success) {
        setProfileRelationUsers(data.friends || []);
        setProfileUser(prev => prev ? {
          ...prev,
          friendCount: data.count ?? (data.friends || []).length,
        } : prev);
      } else if (data) {
        showToast(data.message || '无法加载朋友列表', true);
      }
      return;
    }
    const endpoint = type === 'following' ? 'following' : 'followers';
    const data = await apiFetch(`${API_PREFIX}/users/me/relationships/${endpoint}`);
    setIsLoadingProfileRelations(false);
    if (data && data.success) {
      setProfileRelationUsers(data.users || []);
      setProfileUser(prev => prev ? {
        ...prev,
        [type === 'following' ? 'followingCount' : 'followerCount']: data.count ?? (data.users || []).length,
      } : prev);
    } else if (data) {
      showToast(data.message || '无法加载列表', true);
    }
  };

  const closeProfileRelationModal = () => {
    setProfileRelationModal(null);
    setProfileRelationUsers([]);
  };

  const openProfileFromRelationModal = (targetUserId) => {
    closeProfileRelationModal();
    openUserProfile(targetUserId);
  };

  const handleProfileMediaChange = async (kind, file) => {
    if (!file || profileUserId !== user?.id) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', true);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB', true);
      return;
    }

    setIsUpdatingProfileMedia(true);
    const formData = new FormData();
    formData.append(kind, file);
    const data = await apiFetch(`${API_PREFIX}/users/me/profile-media`, {
      method: 'PUT',
      body: formData,
      timeoutMs: 30000,
    });
    setIsUpdatingProfileMedia(false);

    if (data && data.success) {
      setProfileUser(data.user);
      setUser(prev => prev ? { ...prev, ...data.user } : prev);
      showToast(kind === 'avatar' ? '头像已更新' : '主页背景已更新');
    } else if (data) {
      showToast(data.message || '更新失败', true);
    }
  };

  const fetchProfileVideos = async (tab, userId, cursor = null, append = false) => {
    const targetId = userId ?? profileUserId;
    if (!targetId) return;
    let endpoint = `${API_PREFIX}/users/${targetId}/videos`;
    if (tab === 'liked') {
      endpoint = `${API_PREFIX}/users/${targetId}/likes/videos`;
    } else if (tab === 'favorited') {
      endpoint = `${API_PREFIX}/users/${targetId}/favorites/videos`;
    }
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${endpoint}?limit=8${cursorParam}`);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setProfileVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setProfileVideosPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const switchProfileTab = async (tab) => {
    if (tab === profileTab) return;
    resetBatchManage();
    setProfileTab(tab);
    setProfileVideos([]);
    setProfileVideosPagination({ nextCursor: null, hasMore: false });
    await fetchProfileVideos(tab, profileUserId);
  };

  const startSingleVideoPlayback = (video, { queue = null, startIndex = 0 } = {}) => {
    curatedFeedRef.current = true;
    loadingMoreFeedRef.current = false;
    setIsLoadingMoreFeed(false);
    setFeedPagination({ nextCursor: null, hasMore: false });
    const playlist = (queue && queue.length > 0 ? queue : [video]).map(normalizeFeedVideo);
    const safeIndex = Math.min(Math.max(startIndex, 0), playlist.length - 1);
    setVideos(playlist);
    setCurrentIndex(safeIndex);
    setAllViewed(false);
    setNavTab('recommend');
    setCurrentView('feed');
  };

  const handlePlayProfileVideo = (videoItem) => {
    const startIndex = profileVideos.findIndex((v) => v.id === videoItem.id);
    startSingleVideoPlayback(videoItem, {
      queue: profileVideos,
      startIndex: startIndex >= 0 ? startIndex : 0,
    });
    closeUserProfile();
  };

  const formatNotificationTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const fetchRelation = async (targetUserId) => {
    const data = await apiFetch(`${API_PREFIX}/users/me/relationships/${targetUserId}`, { silent: true });
    if (data && data.success) {
      setFollowMap(prev => ({ ...prev, [targetUserId]: { isFollowing: data.isFollowing, isFriend: data.isFriend } }));
    }
  };

  const handleFollowToggle = async (targetUserId, e) => {
    e?.stopPropagation();
    if (!token) { showToast('请先登录', true); return; }
    if (targetUserId === user?.id) return;
    const isFollowing = followMap[targetUserId]?.isFollowing;
    const data = await apiFetch(`${API_PREFIX}/users/me/relationships/${targetUserId}`, { method: isFollowing ? 'DELETE' : 'POST' });
    if (data && data.success) {
      showToast(data.message);
      setFollowMap(prev => ({ ...prev, [targetUserId]: { isFollowing: !isFollowing, isFriend: data.isFriend ?? false } }));
      if (navTab === 'friends') fetchFriends();
      if (navTab === 'following') fetchFollowing();
      if (currentView === 'profile' && profileUserId === user?.id) {
        setProfileUser(prev => prev ? {
          ...prev,
          followingCount: data.followingCount ?? prev.followingCount,
          friendCount: data.friendCount ?? prev.friendCount,
        } : prev);
      }
      if (currentView === 'profile' && profileUserId === targetUserId) {
        setProfileUser(prev => prev ? {
          ...prev,
          followerCount: data.followerCount ?? Math.max(0, (prev.followerCount ?? 0) + (isFollowing ? -1 : 1)),
          friendCount: data.friendCount ?? prev.friendCount,
        } : prev);
      }
    } else if (data) showToast(data.message, true);
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults(null); return; }
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const data = await apiFetch(`${API_PREFIX}/videos?q=${encodeURIComponent(q.trim())}`);
      setIsSearching(false);
      if (data && data.success) setSearchResults(data);
    }, 400);
  };

  const clearSearch = () => { setSearchQuery(''); setSearchResults(null); };

  const playSearchVideo = (video) => {
    exitSearchPage();
    setSearchResults(null);
    setSearchQuery('');
    clearSearch();
    startSingleVideoPlayback(video);
  };

  const openFriendChat = async (friend) => {
    setActiveFriend(friend);
    setIsLoadingChat(true);
    setChatHistory([]);
    setChatDraft('');
    try {
      const data = await apiFetch(`${API_PREFIX}/users/me/chat-history/${friend.id}`);
      if (data && data.success) {
        setChatHistory(data.history || []);
      } else {
        setChatHistory([]);
      }
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setChatHistory([]);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const sendChatMessage = async (e) => {
    e?.preventDefault();
    const content = chatDraft.trim();
    if (!content || !activeFriend || isSendingChat) return;

    setIsSendingChat(true);
    const data = await apiFetch(`${API_PREFIX}/users/me/chat-history/${activeFriend.id}`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    setIsSendingChat(false);

    if (data && data.success) {
      setChatDraft('');
      if (data.chatMessage) {
        setChatHistory(prev => [...prev, data.chatMessage]);
      } else {
        await openFriendChat(activeFriend);
      }
    } else if (data) {
      showToast(data.message || '消息发送失败', true);
    }
  };

  const fetchFriends = async () => {
    setIsLoadingFriends(true);
    const data = await apiFetch(`${API_PREFIX}/users/me/relationships/friends`);
    setIsLoadingFriends(false);
    if (data && data.success) {
      const friendsList = data.friends || [];
      setFriends(friendsList);
      if (friendsList.length > 0) {
        openFriendChat(friendsList[0]);
      } else {
        setActiveFriend(null);
        setChatHistory([]);
      }
    }
  };

  const fetchFollowing = async () => {
    setIsLoadingFollowing(true);
    const data = await apiFetch(`${API_PREFIX}/users/me/relationships/following`);
    setIsLoadingFollowing(false);
    if (data && data.success) {
      const users = data.users || [];
      setFollowingUsers(users);
      // 拉所有关注的人的视频合并播放
      if (users.length > 0) {
        setIsLoadingFeed(true);
        const videoLists = await Promise.all(
            users.map(u => apiFetch(`${API_PREFIX}/users/${u.id}/videos?limit=20`))
        );
        setIsLoadingFeed(false);
        const allVideos = videoLists
            .filter(d => d && d.success)
            .flatMap(d => d.videos || [])
            .map(normalizeFeedVideo)
            // 按发布时间降序排列
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setVideos(allVideos);
        setCurrentIndex(0);
        setAllViewed(false);
        setFeedPagination({ nextCursor: null, hasMore: false });
      } else {
        setVideos([]);
      }
    }
  };

  const fetchUserVideos = async (targetUser) => {
    setSelectedFollowingUser(targetUser);
    setIsLoadingFeed(true);

    const data = await apiFetch(`${API_PREFIX}/users/${targetUser.id}/videos`);

    // 调试日志
    console.log('=== fetchUserVideos 调试 ===');
    console.log('targetUser:', targetUser);
    console.log('响应数据:', data);
    console.log('data.success:', data?.success);
    console.log('data.videos:', data?.videos);

    setIsLoadingFeed(false);

    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      console.log('处理后的视频数量:', fetchedVideos.length);

      setVideos(fetchedVideos);
      setCurrentIndex(0);
      setAllViewed(false);
      setFeedPagination({ nextCursor: null, hasMore: false });

      if (fetchedVideos.length === 0) {
        showToast(`@${targetUser.username} 还没有发布任何视频`, false);
      }
    } else {
      console.error('获取用户视频失败:', data);
      showToast('加载失败，请稍后重试', true);
      setVideos([]);
    }
  };

  const extractVideoFirstFrame = (videoFile) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const url = URL.createObjectURL(videoFile);
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(new Error('Frame extraction timed out'));
      }, 15000);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.onloadedmetadata = () => {
        if (video.duration > 0.1) {
          video.currentTime = 0.1;
        } else {
          video.currentTime = 0;
        }
      };
      video.onseeked = () => {
        clearTimeout(timeout);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/jpeg', 0.9);
      };
      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video for frame extraction'));
      };
      video.src = url;
    });
  };

  const extractVideoFrameAtRatio = (videoFile, ratio = 0.1) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const url = URL.createObjectURL(videoFile);
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        reject(new Error('Frame extraction timed out'));
      }, 15000);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        video.currentTime = Math.max(0, Math.min(duration - 0.05, duration * ratio));
      };
      video.onseeked = () => {
        clearTimeout(timeout);
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/jpeg', 0.9);
      };
      video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video for frame extraction'));
      };
      video.src = url;
    });
  };

  const buildCoverCandidate = (blob, index, ratio, source = 'manual') => {
    const file = new File([blob], `cover-${source}-${index}.jpg`, { type: 'image/jpeg' });
    return {
      id: `${source}-${index}-${Date.now()}`,
      file,
      ratio,
      url: URL.createObjectURL(file),
    };
  };

  const resetAiUploadSuggestions = () => {
    setAiCoverCandidates(prev => {
      prev.forEach(item => item.url && URL.revokeObjectURL(item.url));
      return [];
    });
    if (uploadCoverPreview) {
      URL.revokeObjectURL(uploadCoverPreview);
    }
    setUploadCoverPreview('');
    setAiCoverSuggestion(null);
    setAiCategorySuggestion(null);
  };

  const handleUploadVideoChange = async (file) => {
    resetAiUploadSuggestions();
    setUploadVideo(file || null);
    setUploadCover(null);
    if (!file) return;
    try {
      const firstFrame = await extractVideoFrameAtRatio(file, 0.08);
      const firstCandidate = buildCoverCandidate(firstFrame, 0, 0.08, 'auto');
      setAiCoverCandidates([firstCandidate]);
      setUploadCover(firstCandidate.file);
      setUploadCoverPreview(firstCandidate.url);
    } catch (err) {
      console.warn('Initial cover preview extraction failed:', err);
    }
  };

  const handleManualCoverFileChange = (file) => {
    if (!file) return;
    if (uploadCoverPreview) {
      URL.revokeObjectURL(uploadCoverPreview);
    }
    const previewUrl = URL.createObjectURL(file);
    setUploadCover(file);
    setUploadCoverPreview(previewUrl);
    setAiCoverSuggestion(null);
  };

  const generateCoverCandidates = async () => {
    if (!uploadVideo) {
      showToast('请先选择视频文件', true);
      return [];
    }
    const ratios = [0.12, 0.5, 0.88];
    const candidates = [];
    for (let i = 0; i < ratios.length; i += 1) {
      try {
        const blob = await extractVideoFrameAtRatio(uploadVideo, ratios[i]);
        candidates.push(buildCoverCandidate(blob, i, ratios[i], 'ai'));
      } catch (err) {
        console.warn('Cover candidate extraction failed:', ratios[i], err);
      }
    }
    setAiCoverCandidates(prev => {
      prev.forEach(item => item.url && URL.revokeObjectURL(item.url));
      return candidates;
    });
    return candidates;
  };

  const handleGenerateCoverSuggestion = async () => {
    if (!uploadVideo) {
      showToast('请先选择视频文件', true);
      return;
    }
    setIsGeneratingCoverSuggestion(true);
    try {
      const candidates = await generateCoverCandidates();
      if (!candidates.length) {
        showToast('无法从视频中提取候选封面', true);
        return;
      }
      const formData = new FormData();
      formData.append('filename', uploadVideo.name);
      formData.append('title', uploadTitle);
      candidates.forEach(candidate => {
        formData.append('frames', candidate.file);
        formData.append('ratios', String(candidate.ratio));
      });
      const data = await apiFetch(`${API_PREFIX}/ai/cover-suggestions`, {
        method: 'POST',
        body: formData,
        timeoutMs: 180000,
      });
      if (data && data.success) {
        const suggestion = data.suggestion || {};
        const selectedIndex = Number.isInteger(suggestion.selectedIndex) ? suggestion.selectedIndex : 0;
        const selected = candidates[selectedIndex] || candidates[0];
        setAiCoverSuggestion(suggestion);
        setUploadCover(selected.file);
        setUploadCoverPreview(selected.url);
        showToast('AI 已推荐封面');
      } else if (data) {
        showToast(data.message || 'AI 封面建议失败', true);
      }
    } finally {
      setIsGeneratingCoverSuggestion(false);
    }
  };

  const handleUseCoverCandidate = (candidate) => {
    setUploadCover(candidate.file);
    setUploadCoverPreview(candidate.url);
    setAiCoverSuggestion(null);
  };

  const handleGenerateCategorySuggestion = async () => {
    if (!uploadVideo) {
      showToast('请先选择视频文件', true);
      return;
    }
    setIsGeneratingCategorySuggestion(true);
    try {
      let frameFile = uploadCover;
      if (!frameFile) {
        const frameBlob = await extractVideoFirstFrame(uploadVideo);
        frameFile = new File([frameBlob], 'video-frame.jpg', { type: 'image/jpeg' });
      }
      const formData = new FormData();
      formData.append('filename', uploadVideo.name);
      formData.append('title', uploadTitle);
      formData.append('description', uploadDesc);
      if (frameFile) {
        formData.append('frame', frameFile);
      }
      const data = await apiFetch(`${API_PREFIX}/ai/video-tags`, {
        method: 'POST',
        body: formData,
        timeoutMs: 180000,
      });
      if (data && data.success) {
        const tags = data.tags || {};
        setAiCategorySuggestion(tags);
        const tagText = Array.isArray(tags.tags) ? tags.tags.map(tag => `#${String(tag).replace(/^#/, '')}`).join(' ') : '';
        setUploadDesc(prev => [prev, tagText].filter(Boolean).join(prev && tagText ? '\n' : ''));
        showToast('AI 已完成分类');
      } else if (data) {
        showToast(data.message || 'AI 分类失败', true);
      }
    } finally {
      setIsGeneratingCategorySuggestion(false);
    }
  };

  const handlePublish = async (e) => {
    e.preventDefault();
    if (!uploadTitle.trim()) {
      showToast('请输入视频标题！', true);
      return;
    }
    if (!uploadVideo) {
      showToast('请选择要上传的视频文件！', true);
      return;
    }
    setIsUploading(true);
    setUploadProgress(5);
    let coverToUpload = uploadCover;
    if (!coverToUpload && uploadVideo) {
      setUploadStatusMsg('正在提取视频首帧作为封面...');
      try {
        const frameBlob = await extractVideoFirstFrame(uploadVideo);
        coverToUpload = new File([frameBlob], 'cover-auto.jpg', { type: 'image/jpeg' });
      } catch (err) {
        console.warn('Auto cover extraction failed, using fallback:', err);
      }
    }
    setUploadStatusMsg('视频上传切片并写入数据库中...');
    setUploadProgress(10);
    const formData = new FormData();
    formData.append('title', uploadTitle);
    formData.append('description', uploadDesc);
    formData.append('video', uploadVideo);
    if (coverToUpload) {
      formData.append('cover', coverToUpload);
    }
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 15;
      });
    }, 200);
    const data = await apiFetch(`${API_PREFIX}/videos`, {
      method: 'POST',
      body: formData,
      timeoutMs: 0  // 视频上传不限时
    });
    clearInterval(progressInterval);
    setUploadProgress(100);
    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusMsg('');
      if (data && data.success) {
        showToast('🎉 视频发布成功！正在播放你刚发布的视频');
        setIsUploadOpen(false);
        setUploadTitle('');
        setUploadDesc('');
        setUploadVideo(null);
        setUploadCover(null);
        if (data.data) {
          startSingleVideoPlayback(data.data);
        }
        fetchRecommendations();
        if (user?.id && currentView === 'profile' && profileUserId === user.id) {
          refreshOwnPublishedProfile();
        }
        if (user?.role === 'ADMIN' && currentView === 'admin') {
          fetchDevDashboardData();
        }
      } else if (data) {
        showToast(data.message, true);
      }
    }, 300);
  };

  const handleGenerateAiCopy = async () => {
    if (!uploadVideo) {
      showToast('请先选择视频文件', true);
      return;
    }

    setIsGeneratingCopy(true);
    try {
      let frameFile = null;
      try {
        const frameBlob = await extractVideoFirstFrame(uploadVideo);
        frameFile = new File([frameBlob], 'video-frame.jpg', { type: 'image/jpeg' });
      } catch (err) {
        console.warn('AI copy frame extraction failed, using filename only:', err);
      }

      const formData = new FormData();
      formData.append('filename', uploadVideo.name);
      if (frameFile) {
        formData.append('frame', frameFile);
      }

      const data = await apiFetch(`${API_PREFIX}/ai/video-copies`, {
        method: 'POST',
        body: formData,
        timeoutMs: 180000,
      });

      if (data && data.success) {
        const copy = data.copy || {};
        const hashtags = Array.isArray(copy.hashtags) ? copy.hashtags.join(' ') : '';
        setUploadTitle(copy.title || uploadTitle);
        setUploadDesc([copy.description, hashtags].filter(Boolean).join('\n'));
        showToast('AI 文案已生成');
      } else if (data) {
        showToast(data.message || 'AI 文案生成失败', true);
      }
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const handleDeleteVideo = (videoId, e) => {
    e.stopPropagation();
    setDeleteConfirm({ videoId });
  };

  const confirmDeleteVideo = async () => {
    if (!deleteConfirm) return;
    const { videoId } = deleteConfirm;
    setDeleteConfirm(null);
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}`, { method: 'DELETE' });
    if (data && data.success) {
      showToast('视频已成功下架！');
      if (isOwnPublishedProfile) {
        await refreshOwnPublishedProfile();
      }
      fetchRecommendations();
      if (user?.role === 'ADMIN' && currentView === 'admin') {
        fetchDevDashboardData();
      }
    } else if (data) {
      showToast(data.message || '删除失败', true);
    }
  };

  // Batch delete management
  const toggleBatchMode = () => {
    setBatchManageMode(prev => !prev);
    setSelectedVideoIds(new Set());
  };

  const toggleVideoSelection = (videoId, e) => {
    e.stopPropagation();
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  const selectAllVideos = () => {
    if (!isOwnPublishedProfile || profileVideos.length === 0) return;
    const allIds = new Set(profileVideos.map(v => v.id));
    if (selectedVideoIds.size === allIds.size) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(allIds);
    }
  };

  const executeBatchDelete = async () => {
    if (selectedVideoIds.size === 0) {
      showToast('请至少选择一个视频', true);
      return;
    }
    const ids = Array.from(selectedVideoIds);
    const data = await apiFetch(`${API_PREFIX}/video-deletion-jobs`, {
      method: 'POST',
      body: JSON.stringify({ videoIds: ids })
    });
    if (data && data.success) {
      showToast(`成功删除 ${ids.length} 个视频`);
      resetBatchManage();
      if (isOwnPublishedProfile) {
        await refreshOwnPublishedProfile();
      }
      fetchRecommendations();
      if (user?.role === 'ADMIN' && currentView === 'admin') {
        fetchDevDashboardData();
      }
    } else if (data) {
      showToast(data.message || '批量删除失败', true);
    }
  };

  const handlePlayMyVideoItem = (videoItem) => {
    startSingleVideoPlayback(videoItem);
  };

  const handleVideoPlaybackError = (e) => {
    const mediaError = e?.currentTarget?.error;
    const failedUrl = videos[currentIndex]?.video_url;
    console.error('Video playback failed:', mediaError, failedUrl);

    if (currentIndex < videos.length - 1) {
      showToast('该视频文件在本机不存在或已损坏，已自动跳过', true);
      setCurrentIndex(prev => prev + 1);
      return;
    }

    showToast(
        failedUrl?.startsWith('/uploads/')
            ? '视频文件不在本机（数据库记录在，但 uploads 目录无文件）'
            : '视频加载失败，请检查网络或稍后重试',
        true
    );
  };

  const togglePlayState = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
    setPlayTriggerAnim(true);
    setTimeout(() => setPlayTriggerAnim(false), 500);
  };

  const toggleMuted = (e) => {
    e.stopPropagation();
    setIsMuted(prev => !prev);
  };

  const toggleVideoZoom = (e) => {
    e.stopPropagation();
    setIsVideoZoomed(prev => !prev);
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const currentTime = videoRef.current.currentTime || 0;
    
    // Reset shown danmaku tracker if user rewound the video or if it looped
    if (currentTime < lastTimeRef.current - 0.5) {
      shownDanmakuIdsRef.current = new Set();
      setActiveDanmaku([]);
    }
    lastTimeRef.current = currentTime;

    setPlaybackProgress({
      currentTime,
      duration: Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0
    });
    spawnDanmakuAtCurrentTime(currentTime);
  };

  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = playbackRate;
    shownDanmakuIdsRef.current = new Set();
    setActiveDanmaku([]);
    handleVideoTimeUpdate();
  };

  const handleSeekVideo = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    videoRef.current.currentTime = duration * ratio;
    shownDanmakuIdsRef.current = new Set();
    setActiveDanmaku([]);
    handleVideoTimeUpdate();
  };

  const handlePlaybackRateChange = (e) => {
    e.stopPropagation();
    const nextRate = Number(e.target.value);
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const loadMoreFeed = async () => {
    if (!feedPagination.hasMore || !feedPagination.nextCursor || loadingMoreFeedRef.current) {
      return false;
    }
    return fetchRecommendations(feedPagination.nextCursor, true);
  };

  useEffect(() => {
    if (!token || currentView !== 'feed' || videos.length === 0 || allViewed) return;
    const remainingVideos = videos.length - 1 - currentIndex;
    if (remainingVideos <= FEED_PREFETCH_THRESHOLD) {
      loadMoreFeed();
    }
  }, [token, currentView, currentIndex, videos.length, allViewed, feedPagination.nextCursor, feedPagination.hasMore]);

  useEffect(() => {
    if (currentView !== 'feed' || videos.length === 0) {
      preloadedMediaRef.current = [];
      return;
    }
    preloadedMediaRef.current = videos
        .slice(currentIndex + 1, currentIndex + 1 + MEDIA_PRELOAD_AHEAD)
        .map(video => {
          const preloadVideo = document.createElement('video');
          preloadVideo.preload = 'auto';
          preloadVideo.muted = true;
          preloadVideo.playsInline = true;
          preloadVideo.src = getMediaUrl(video.video_url);
          preloadVideo.load();
          return preloadVideo;
        });
  }, [currentView, currentIndex, videos]);

  const handleNextVideo = async () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const loaded = await loadMoreFeed();
      if (loaded) {
        setCurrentIndex(prev => prev + 1);
      } else if (!feedPagination.hasMore) {
        showToast('👏 您已看完所有推荐！点击右侧的"重置已看"即可从头刷起！');
      }
    }
  };

  const handlePrevVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const lockScrollTransition = () => {
    scrollLockRef.current = true;
    setTimeout(() => {
      scrollLockRef.current = false;
    }, 800);
  };

  const handleTouchStart = (e) => {
    touchStartRef.current = { y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e) => {
    if (scrollLockRef.current) return;
    const deltaY = touchStartRef.current.y - e.changedTouches[0].clientY;
    const threshold = 50;
    if (deltaY > threshold) {
      if (currentIndex < videos.length - 1) {
        lockScrollTransition();
        setCurrentIndex(prev => prev + 1);
      } else {
        lockScrollTransition();
        handleNextVideo();
      }
    } else if (deltaY < -threshold) {
      if (currentIndex > 0) {
        lockScrollTransition();
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (scrollLockRef.current) return;
    if (e.deltaY > 30) {
      if (currentIndex < videos.length - 1) {
        lockScrollTransition();
        setCurrentIndex(prev => prev + 1);
      } else {
        lockScrollTransition();
        handleNextVideo();
      }
    } else if (e.deltaY < -30) {
      if (currentIndex > 0) {
        lockScrollTransition();
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  const openLikedVideosPanel = () => {
    setIsLikedVideosOpen(true);
    fetchLikedVideos();
  };

  const openSharePanel = (videoId) => {
    setShareTargetVideoId(videoId);
    setIsShareOpen(true);
    setUserSearchQuery('');
    setUserSearchResults([]);
    fetchFriends();
  };

  const openSharedVideosPanel = () => {
    setIsSharedVideosOpen(true);
    fetchSharedVideos();
  };

  const formatBody = (body) => {
    if (!body || body.trim() === '') return '(empty)';
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  };

  if (isCheckingSession && token) {
    return (
        <div className="auth-wrapper">
          <div className="phone-loading-screen" style={{ position: 'relative', zIndex: 1 }}>
            <div className="loading-spinner" />
            <p>正在恢复登录态...</p>
          </div>
        </div>
    );
  }

  if (!token) {
    return (
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-logo">
              <div className="logo-icon va-logo" aria-label="Vidora logo">VA</div>
              <h2>Vidora 短视频社区</h2>
              <p>{authMode === 'login' ? '智能算法推荐与实时开发监控' : '创建开发者账户'}</p>
            </div>
            <form className="auth-form" onSubmit={handleAuth}>
              <div className="input-group">
                <label>用户名</label>
                <input type="text" placeholder="输入用户名" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>密码</label>
                <input type="password" placeholder="输入密码" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <button type="submit" className="auth-btn">{authMode === 'login' ? '开启平台' : '立即注册'}</button>
            </form>
            <div className="auth-switch">
              {authMode === 'login' ? <>没有账户？ <span onClick={() => setAuthMode('register')}>立即注册</span></> : <>已有账户？ <span onClick={() => setAuthMode('login')}>直接登录</span></>}
            </div>
          </div>
          {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}><span>{toast.message}</span></div>}
        </div>
    );
  }

  const activeVideo = videos[currentIndex];
  const isAdmin = user?.role === 'ADMIN';
  const progressPercent = playbackProgress.duration > 0 ? (playbackProgress.currentTime / playbackProgress.duration) * 100 : 0;

  const fs = activeVideo?.user_id ? followMap[activeVideo.user_id] : null;
  const isFollowingCreator = fs?.isFollowing ?? false;
  const isFriendWithCreator = fs?.isFriend ?? false;

  const doSearch = async (q) => {
    if (!q.trim()) return;
    setSearchPageQuery(q);
    setSearchPage(true);
    setSearchResults(null);
    setIsSearchPageLoading(true);
    setSearchQuery(q);
    const data = await apiFetch(`${API_PREFIX}/videos?q=${encodeURIComponent(q.trim())}`);
    setIsSearchPageLoading(false);
    if (data && data.success) setSearchPageResults(data);
  };

  const exitSearchPage = () => {
    setSearchPage(false);
    setSearchPageResults(null);
    setSearchQuery('');
    setSearchResults(null);
    setSearchPageQuery('');
    setSearchQuery('');
  };

  return (
      <div className="webapp-container">
        <header className="webapp-header">
          <div className="logo-area">
            <div className="mini-logo va-logo" aria-label="Vidora logo">VA</div>
            <h1>Vidora 短视频社区</h1>
          </div>

          <div className="header-search-wrap">
            <div className="header-search-box">
              <svg className="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input
                  type="text"
                  className="header-search-input"
                  placeholder="搜索视频、用户..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={(e) => { if (e.key === 'Enter') doSearch(searchQuery); }}
              />
              {searchQuery && <button className="search-clear-btn" onClick={clearSearch}>✕</button>}
              <button className="search-submit-btn" onClick={() => doSearch(searchQuery)}>搜索</button>
            </div>
            {(searchResults || isSearching) && !searchPage && (
                <div className="search-dropdown">
                  {isSearching ? (
                      <div className="search-loading"><div className="loading-spinner" style={{ width: 24, height: 24, margin: '16px auto' }} /></div>
                  ) : searchResults ? (
                      <>
                        {searchResults.users?.length > 0 && (
                            <div className="search-section">
                              <div className="search-section-title">用户</div>
                              {searchResults.users.map(u => (
                                  <div
                                      key={u.id}
                                      className="search-result-item clickable-profile"
                                      onClick={() => { clearSearch(); openUserProfile(u.id); }}
                                      style={{ cursor: 'pointer' }}
                                  >
                                    <img src={getAvatarUrl(u)} alt="" className="search-avatar" />
                                    <div className="search-item-info">
                                      <div className="search-item-name">@{u.username}</div>
                                      {u.displayName && <div className="search-item-sub">{u.displayName}</div>}
                                    </div>
                                  </div>
                              ))}
                            </div>
                        )}
                        {searchResults.videos?.length > 0 && (
                            <div className="search-section">
                              <div className="search-section-title">视频</div>
                              {searchResults.videos.map(v => (
                                  <div key={v.id} className="search-result-item" onClick={() => playSearchVideo(v)}>
                                    <img src={getMediaUrl(v.cover_url)} alt="" className="search-video-thumb" />
                                    <div className="search-item-info">
                                      <div className="search-item-name">{v.title}</div>
                                      <div className="search-item-sub">@{v.creator_name} · {v.likeCount ?? 0} 赞</div>
                                    </div>
                                  </div>
                              ))}
                            </div>
                        )}
                        {!searchResults.users?.length && !searchResults.videos?.length && <div className="search-empty">未找到相关内容</div>}
                      </>
                  ) : null}
                </div>
            )}
          </div>

          <div className="header-right">
            {isAdmin && (
                <button className={`admin-tab-btn ${currentView === 'admin' ? 'active' : ''}`} onClick={() => setCurrentView(currentView === 'admin' ? 'feed' : 'admin')}>
                  📊 监控台
                </button>
            )}
            {token && (
                <div className="header-quick-actions">
                  <button className="header-quick-btn" onClick={() => setIsUploadOpen(true)} title="发布视频">
                    <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    <span>发视频</span>
                  </button>
                  <button className="header-quick-btn" onClick={handleResetViews} title="重置已看">
                    <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                    <span>重置已看</span>
                  </button>
                  <button className="header-quick-btn like-notification-trigger" onClick={openLikeNotificationsPanel} title="消息通知">
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                      {likeNotificationUnreadCount > 0 && (
                          <span className="header-notification-badge">
            {likeNotificationUnreadCount > 99 ? '99+' : likeNotificationUnreadCount}
          </span>
                      )}
                    </div>
                    <span>消息通知</span>
                  </button>
                </div>
            )}
            <div className="user-profile-widget">
              <div className="user-info">
                <div className="username">UID: {user?.id} • {user?.username}</div>
                <div className="role">{isAdmin ? '🔧 系统管理员' : '👤 普通用户'}</div>
              </div>
              <button className="logout-btn danger" onClick={handleDeleteAccount}>注销账户</button>
              <button className="logout-btn" onClick={() => { setToken(''); setUser(null); }}>
                <svg style={{ width: 14, height: 14, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M16 13v-2H7V9l-5 4 5 4v-2h9zM20 3h-9c-1.1 0-2 .9-2 2v4h2V5h9v14h-9v-4H9v4c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" /></svg>
                安全退出
              </button>
            </div>
          </div>
        </header>
        {searchPage && (
            <div className="search-page-overlay">
              <div className="search-page-header">
                <button className="search-page-back" onClick={exitSearchPage}>
                  <svg style={{ width: 20, height: 20, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                </button>
                <span className="search-page-keyword">"{searchPageQuery}"</span>
                <span className="search-page-count">
        {searchPageResults ? `${(searchPageResults.videos?.length || 0) + (searchPageResults.users?.length || 0)} 个结果` : ''}
      </span>
              </div>

              {isSearchPageLoading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
              ) : searchPageResults ? (
                  <div className="search-page-content">
                    {searchPageResults.users?.length > 0 && (
                        <div className="search-page-section">
                          <div className="search-page-section-title">用户</div>
                          <div className="search-page-users">
                            {searchPageResults.users.map(u => (
                                <div
                                    key={u.id}
                                    className="search-user-card clickable-profile"
                                    onClick={() => { exitSearchPage(); openUserProfile(u.id); }}
                                    style={{ cursor: 'pointer' }}
                                >
                                  <img src={getAvatarUrl(u)} alt="" className="search-user-avatar" />
                                  <div className="search-user-info">
                                    <div className="search-user-name">@{u.username}</div>
                                    {u.displayName && <div className="search-user-sub">{u.displayName}</div>}
                                  </div>
                                  <button
                                      className={`search-follow-btn ${followMap[u.id]?.isFollowing ? 'following' : ''}`}
                                      onClick={(e) => { e.stopPropagation(); handleFollowToggle(u.id, e); }}
                                  >
                                    {followMap[u.id]?.isFollowing ? '已关注' : '+ 关注'}
                                  </button>
                                </div>
                            ))}
                          </div>
                        </div>
                    )}

                    {searchPageResults.videos?.length > 0 && (
                        <div className="search-page-section">
                          <div className="search-page-section-title">视频</div>
                          <div className="search-page-videos">
                            {searchPageResults.videos.map(v => (
                                <div key={v.id} className="search-video-card" onClick={() => { exitSearchPage(); startSingleVideoPlayback(v); }}>
                                  <div className="search-video-thumb-wrap">
                                    <img src={getMediaUrl(v.cover_url)} alt={v.title} className="search-video-thumb-img" />
                                    <div className="search-video-likes">
                                      <svg style={{ width: 12, height: 12, fill: '#fff' }} viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                      {v.likeCount ?? 0}
                                    </div>
                                  </div>
                                  <div className="search-video-title">{v.title}</div>
                                  <div className="search-video-creator">@{v.creator_name}</div>
                                </div>
                            ))}
                          </div>
                        </div>
                    )}

                    {!searchPageResults.users?.length && !searchPageResults.videos?.length && (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
                          <p>未找到与 "{searchPageQuery}" 相关的内容</p>
                        </div>
                    )}
                  </div>
              ) : null}
            </div>
        )}
        <div className="webapp-body">
          <nav className="left-sidebar">
            <button className={`sidebar-nav-item ${navTab === 'featured' ? 'active' : ''}`} onClick={() => {
              curatedFeedRef.current = false;
              setCurrentView('feed');
              if (navTab === 'featured') {
                fetchFeaturedVideos(featuredCategory);
              } else {
                setNavTab('featured');
              }
            }}>
              <svg viewBox="0 0 24 24"><path d="M4 6h16v2H4V6zm0 5h10v2H4v-2zm0 5h16v2H4v-2z"/></svg>
              <span>精选</span>
            </button>
            <button className={`sidebar-nav-item ${navTab === 'recommend' ? 'active' : ''}`} onClick={() => {
              curatedFeedRef.current = false;
              setCurrentView('feed');
              if (navTab === 'recommend') {
                setVideos([]);
                setCurrentIndex(0);
                setAllViewed(false);
                setFeedPagination({ nextCursor: null, hasMore: false });
                fetchRecommendations();
              } else {
                setNavTab('recommend');
              }
            }}>
              <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
              <span>推荐</span>
            </button>
            <button className={`sidebar-nav-item ${navTab === 'following' ? 'active' : ''}`} onClick={() => { curatedFeedRef.current = false; setNavTab('following'); setCurrentView('feed'); }}>
              <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              <span>关注</span>
            </button>
            <button className={`sidebar-nav-item ${navTab === 'friends' ? 'active' : ''}`} onClick={() => { curatedFeedRef.current = false; setNavTab('friends'); setCurrentView('feed'); }}>
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/></svg>
              <span>朋友</span>
            </button>
            <button className={`sidebar-nav-item ${navTab === 'watchlater' ? 'active' : ''}`} onClick={openWatchLaterTab}>
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
              <span>稍后再看</span>
              {watchLaterCount > 0 && <em className="sidebar-nav-badge">{watchLaterCount}</em>}
            </button>
            <button className={`sidebar-nav-item ${navTab === 'mine' ? 'active' : ''}`} onClick={openMyProfile}>
              <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
              <span>我的</span>
            </button>
          </nav>
          <div className="webapp-main">

            {currentView === 'feed' && (
                <>
                  {/* 精选页：分类栏 + 多列网格 */}
                  {navTab === 'featured' && (
                      <main className="featured-main">
                        <div className="featured-category-bar-wrap">
                          <button type="button" className="featured-category-scroll-btn" onClick={() => scrollFeaturedCategories(-1)} aria-label="向左滚动分类">
                            <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
                          </button>
                          <div className="featured-category-bar" ref={categoryBarRef}>
                            {FEATURED_CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    className={`featured-category-item ${featuredCategory === cat.id ? 'active' : ''}`}
                                    onClick={() => switchFeaturedCategory(cat.id)}
                                >
                                  {cat.label}
                                </button>
                            ))}
                          </div>
                          <button type="button" className="featured-category-scroll-btn" onClick={() => scrollFeaturedCategories(1)} aria-label="向右滚动分类">
                            <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
                          </button>
                        </div>

                        <div className="featured-grid-scroll">
                          {isLoadingFeatured && featuredVideos.length === 0 ? (
                              <div className="featured-loading">
                                <div className="loading-spinner" />
                                <p>精选内容加载中...</p>
                              </div>
                          ) : featuredVideos.length > 0 ? (
                              <>
                                <div className="featured-video-grid">
                                  {featuredVideos.map((fv, idx) => (
                                      <article
                                          key={`featured-${fv.id}`}
                                          className="featured-video-card"
                                          onClick={() => handlePlayFeaturedVideo(fv, idx)}
                                      >
                                        <div className="featured-video-thumb">
                                          <img src={getMediaUrl(fv.cover_url)} alt={fv.title} loading="lazy" />
                                          <div className="featured-video-likes">
                                            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                            <span>{formatLikeCount(fv.likeCount ?? fv.likes_count ?? 0)}</span>
                                          </div>
                                          <div className="featured-video-duration">{estimateVideoDuration(fv)}</div>
                                        </div>
                                        <h3 className="featured-video-title">{fv.title}</h3>
                                        <div className="featured-video-meta">
                                          <span>@{fv.creator_name || '创作者'}</span>
                                          <span className="featured-video-dot">·</span>
                                          <span>{formatRelativeTime(fv.created_at)}</span>
                                        </div>
                                      </article>
                                  ))}
                                </div>
                                {featuredCategory === 'all' && (
                                    <div className="featured-load-more">
                                      <button
                                          type="button"
                                          disabled={!featuredPagination.hasMore || isLoadingFeatured}
                                          onClick={() => fetchFeaturedVideos(featuredCategory, featuredPagination.nextCursor, true)}
                                      >
                                        {isLoadingFeatured ? '加载中...' : featuredPagination.hasMore ? '加载更多' : '没有更多了'}
                                      </button>
                                    </div>
                                )}
                              </>
                          ) : (
                              <div className="featured-empty">
                                <p>该分类下暂无可播放视频</p>
                                <button type="button" className="reset-views-btn" onClick={() => switchFeaturedCategory('all')}>查看全部精选</button>
                              </div>
                          )}
                        </div>
                      </main>
                  )}

                  {/* 稍后再看合集 */}
                  {navTab === 'watchlater' && (
                      <main className="featured-main watch-later-main">
                        <div className="watch-later-header">
                          <h2>稍后再看</h2>
                          <p>{watchLaterCount > 0 ? `共 ${watchLaterCount} 个视频` : '把想晚点看的视频加进来'}</p>
                        </div>
                        <div className="featured-grid-scroll">
                          {isLoadingWatchLater && watchLaterVideos.length === 0 ? (
                              <div className="featured-loading">
                                <div className="loading-spinner" />
                                <p>稍后再看加载中...</p>
                              </div>
                          ) : watchLaterVideos.length > 0 ? (
                              <>
                                <div className="featured-video-grid">
                                  {watchLaterVideos.map((wv, idx) => (
                                      <article
                                          key={`watchlater-${wv.id}`}
                                          className="featured-video-card"
                                          onClick={() => handlePlayWatchLaterVideo(wv, idx)}
                                      >
                                        <div className="featured-video-thumb">
                                          <img src={getMediaUrl(wv.cover_url)} alt={wv.title} loading="lazy" />
                                          <div className="featured-video-likes">
                                            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                            <span>{formatLikeCount(wv.likeCount ?? wv.likes_count ?? 0)}</span>
                                          </div>
                                        </div>
                                        <h3 className="featured-video-title">{wv.title}</h3>
                                        <div className="featured-video-meta">
                                          <span>@{wv.creator_name || '创作者'}</span>
                                        </div>
                                      </article>
                                  ))}
                                </div>
                                <div className="featured-load-more">
                                  <button
                                      type="button"
                                      disabled={!watchLaterPagination.hasMore || isLoadingWatchLater}
                                      onClick={() => fetchWatchLaterVideos(watchLaterPagination.nextCursor, true)}
                                  >
                                    {isLoadingWatchLater ? '加载中...' : watchLaterPagination.hasMore ? '加载更多' : '没有更多了'}
                                  </button>
                                </div>
                              </>
                          ) : (
                              <div className="featured-empty">
                                <p>还没有加入稍后再看的视频</p>
                                <button type="button" className="reset-views-btn" onClick={() => setNavTab('recommend')}>去推荐页逛逛</button>
                              </div>
                          )}
                        </div>
                      </main>
                  )}

                  {/* 关注页：左侧用户列表 + 右侧视频 */}
                  {navTab === 'following' && (
                      <div className="following-layout" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                        <div className="following-user-list" style={{ width: 260, flexShrink: 0, background: 'rgba(0,0,0,0.6)', borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', padding: '16px 0' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', padding: '0 16px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>我关注的人</div>
                          {isLoadingFollowing ? (
                              <div style={{ textAlign: 'center', padding: 32 }}><div className="loading-spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
                          ) : followingUsers.length > 0 ? followingUsers.map(u => (
                              <div key={u.id}
                                   onClick={() => fetchUserVideos(u)}
                                   style={{
                                     display: 'flex', alignItems: 'center', gap: 12,
                                     padding: '12px 16px', cursor: 'pointer',
                                     background: selectedFollowingUser?.id === u.id ? 'rgba(186,230,253,0.12)' : 'transparent',
                                     borderLeft: selectedFollowingUser?.id === u.id ? '3px solid var(--primary-cyan)' : '3px solid transparent',
                                     transition: 'all 0.15s'
                                   }}
                              >
                                <img src={getAvatarUrl(u)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: selectedFollowingUser?.id === u.id ? '2px solid var(--primary-cyan)' : 'none' }} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: selectedFollowingUser?.id === u.id ? 'var(--primary-cyan)' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{u.username}</div>
                                  {u.displayName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.displayName}</div>}
                                  {u.isFriend ? (
                                      <div style={{ fontSize: 10, color: 'var(--primary-pink)', marginTop: 2 }}>♥ 好友</div>
                                  ) : (
                                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>✓ 已关注</div>
                                  )}
                                </div>
                              </div>
                          )) : (
                              <div style={{ padding: '32px 20px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>还没有关注任何人<br />去推荐页关注你喜欢的创作者吧</div>
                          )}
                        </div>

                        <main className="web-feed-main" style={{ flex: 1 }}>
                          {isLoadingFeed ? (
                              <div className="web-feed-center"><div className="loading-spinner" /><p>加载中...</p></div>
                          ) : videos.length > 0 && activeVideo ? (
                              <div className={`web-video-stage ${isVideoZoomed ? 'is-zoomed' : ''}`} ref={videoStageRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                                <div className="web-video-bg" style={{ backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.4) saturate(1.5)', transform: 'scale(1.1)' }} />
                                <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                                  <video ref={videoRef} className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`} loop muted={isMuted} preload="metadata" playsInline
                                         src={getMediaUrl(activeVideo.video_url)} poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                                         onTimeUpdate={handleVideoTimeUpdate} onLoadedMetadata={handleVideoLoadedMetadata} onError={handleVideoPlaybackError} />
                                  {renderVideoPlayerExtras()}
                                  <div className="video-play-overlay">{playTriggerAnim && <div className="play-pause-icon-anim">{isPlaying ? <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>}</div>}</div>
                                  <button className="web-mute-button" onClick={toggleMuted}>{isMuted ? <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.62 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73L16.25 17.52c-.67.52-1.43.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg> : <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}</button>
                                  <button className="web-zoom-button" onClick={toggleVideoZoom}>
                                    {isVideoZoomed ? <svg viewBox="0 0 24 24"><path d="M5 14h2v3h3v2H5v-5zm12 3v-3h2v5h-5v-2h3zM7 7v3H5V5h5v2H7zm12 3h-2V7h-3V5h5v5z"/></svg> : <svg viewBox="0 0 24 24"><path d="M15 3h6v6h-2V6.41l-4.29 4.3-1.42-1.42 4.3-4.29H15V3zM9 21H3v-6h2v2.59l4.29-4.3 1.42 1.42-4.3 4.29H9V21zm12 0h-6v-2h2.59l-4.3-4.29 1.42-1.42 4.29 4.3V15h2v6zM3 9V3h6v2H6.41l4.3 4.29-1.42 1.42-4.29-4.3V9H3z"/></svg>}
                                  </button>
                                  <div className="web-video-meta">
                                    <div
                                        className="creator-handle clickable-profile"
                                        onClick={(e) => { e.stopPropagation(); openUserProfile(activeVideo.user_id); }}
                                        title="进入作者主页"
                                    >
                                      @{activeVideo.creator_name || '未知创作者'}
                                      {activeVideo.user_id === user?.id && <span className="my-publish-badge">我的发布</span>}
                                    </div>
                                    <div className="video-caption">{activeVideo.title}{activeVideo.description && ` — ${activeVideo.description}`}</div>
                                  </div>
                                  <div className="web-video-controls" onClick={(e) => e.stopPropagation()}>
                                    <div className="web-video-progress-track" onClick={handleSeekVideo}><div className="web-video-progress-fill" style={{ width: `${progressPercent}%` }} /></div>
                                    <div className="web-video-controls-row">
                                      <span className="web-video-time">{formatVideoTime(playbackProgress.currentTime)} / {formatVideoTime(playbackProgress.duration)}</span>
                                      <label className="web-video-speed"><span>倍速</span><select value={playbackRate} onChange={handlePlaybackRateChange}>{PLAYBACK_SPEED_OPTIONS.map(r => <option key={r} value={r}>{r}x</option>)}</select></label>
                                    </div>
                                  </div>
                                </div>

                                <div className="web-action-bar">
                                  <div
                                      className="sidebar-avatar-wrapper clickable-profile"
                                      onClick={(e) => { e.stopPropagation(); openUserProfile(activeVideo.user_id); }}
                                      title="进入作者主页"
                                  >
                                    <div className="sidebar-avatar">
                                      <img src={getAvatarUrl(activeVideo)} alt="avatar" />
                                    </div>
                                    {activeVideo.user_id !== user?.id && (
                                        <button className={`follow-badge-btn ${isFollowingCreator ? (isFriendWithCreator ? 'is-friend' : 'is-following') : ''}`} onClick={(e) => handleFollowToggle(activeVideo.user_id, e)} title={isFollowingCreator ? (isFriendWithCreator ? '好友' : '取关') : '关注'}>
                                          {isFollowingCreator ? (isFriendWithCreator ? '♥' : '✓') : '+'}
                                        </button>
                                    )}
                                  </div>
                                  <button className={`action-item-button ${activeVideo.liked ? 'liked' : ''} ${likingVideoId === activeVideo.id ? 'is-loading' : ''}`} onClick={(e) => handleToggleLike(activeVideo.id, e)} disabled={likingVideoId === activeVideo.id}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>
                                    <span className="action-count">{activeVideo.likeCount ?? 0}</span>
                                  </button>
                                  <button
                                      className="action-item-button special-action"
                                      onClick={(e) => { e.stopPropagation(); openCommentsPanel(activeVideo.id); }}
                                      title="查看评论"
                                  >
                                    <div className="action-icon-circle">
                                      <svg viewBox="0 0 24 24">
                                        <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
                                      </svg>
                                    </div>
                                    <span className="action-count">{activeVideo.commentCount ?? activeVideo.comments_count ?? 0}</span>
                                  </button>
                                  <button
                                      className={`action-item-button ${activeVideo.favorited ? 'favorited' : ''} ${favoritingVideoId === activeVideo.id ? 'is-loading' : ''}`}
                                      onClick={(e) => handleToggleFavorite(activeVideo.id, e)}
                                      disabled={favoritingVideoId === activeVideo.id}
                                      title={activeVideo.favorited ? '取消收藏' : '收藏'}
                                  >
                                    <div className="action-icon-circle">
                                      <svg viewBox="0 0 24 24">
                                        {activeVideo.favorited ? (
                                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                        ) : (
                                            <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z" />
                                        )}
                                      </svg>
                                    </div>
                                    <span className="action-count">{activeVideo.favoriteCount ?? 0}</span>
                                  </button>
                                  <button className="action-item-button special-action" onClick={(e) => { e.stopPropagation(); openSharePanel(activeVideo.id); }}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                    <span className="action-count">分享</span>
                                  </button>
                                  {renderDownloadButton(activeVideo)}
                                </div>

                                <div className="web-nav-arrows">
                                  <button className="arrow-nav-btn" onClick={handlePrevVideo} disabled={currentIndex === 0}>
                                    <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>
                                  </button>
                                  <button className="arrow-nav-btn" onClick={handleNextVideo} disabled={currentIndex === videos.length - 1 && !feedPagination.hasMore}>
                                    <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
                                  </button>
                                </div>

                                <div className="web-feed-progress">
                                  {currentIndex + 1} / {videos.length}{isLoadingMoreFeed ? ' · 加载中...' : ''}
                                </div>
                              </div>
                          ) : selectedFollowingUser ? (
                              <div className="web-feed-center"><p>@{selectedFollowingUser.username} 还没有发布任何视频</p></div>
                          ) : (
                              <div className="web-feed-center">
                                <div style={{ fontSize: 48, marginBottom: 16 }}>👈</div>
                                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>从左侧选择一个关注的人<br />查看他发布的视频</p>
                              </div>
                          )}
                        </main>
                      </div>
                  )}

                  {/* 推荐页 */}
                  {navTab === 'recommend' && (
                      <main className="web-feed-main">
                        {isLoadingFeed ? (
                            <div className="web-feed-center"><div className="loading-spinner" /><p>算法组装中...</p></div>
                        ) : allViewed ? (
                            <div className="web-feed-center">
                              <div className="empty-icon-glow"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></div>
                              <h3>推荐已看完</h3>
                              <p>推荐算法通过您的"已看日志"识别了用户喜好，所有库里的视频已经过滤完毕。</p>
                              <button className="reset-views-btn" onClick={handleResetViews}>🔄 重置浏览历史以重新排序</button>
                            </div>
                        ) : videos.length > 0 && activeVideo ? (
                            <div className={`web-video-stage ${isVideoZoomed ? 'is-zoomed' : ''}`} ref={videoStageRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                              <div className="web-video-bg" style={{ backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.4) saturate(1.5)', transform: 'scale(1.1)' }} />
                              <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                                <video ref={videoRef} className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`} loop muted={isMuted} preload="metadata" playsInline
                                       src={getMediaUrl(activeVideo.video_url)} poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                                       onTimeUpdate={handleVideoTimeUpdate} onLoadedMetadata={handleVideoLoadedMetadata} onError={handleVideoPlaybackError} />
                                {renderVideoPlayerExtras()}
                                <div className="video-play-overlay">{playTriggerAnim && <div className="play-pause-icon-anim">{isPlaying ? <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> : <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>}</div>}</div>
                                <button className="web-mute-button" onClick={toggleMuted}>{isMuted ? <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.62 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73L16.25 17.52c-.67.52-1.43.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg> : <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}</button>
                                <button className="web-zoom-button" onClick={toggleVideoZoom}>
                                  {isVideoZoomed ? <svg viewBox="0 0 24 24"><path d="M5 14h2v3h3v2H5v-5zm12 3v-3h2v5h-5v-2h3zM7 7v3H5V5h5v2H7zm12 3h-2V7h-3V5h5v5z"/></svg> : <svg viewBox="0 0 24 24"><path d="M15 3h6v6h-2V6.41l-4.29 4.3-1.42-1.42 4.3-4.29H15V3zM9 21H3v-6h2v2.59l4.29-4.3 1.42 1.42-4.3 4.29H9V21zm12 0h-6v-2h2.59l-4.3-4.29 1.42-1.42 4.29 4.3V15h2v6zM3 9V3h6v2H6.41l4.3 4.29-1.42 1.42-4.29-4.3V9H3z"/></svg>}
                                </button>
                                <div className="web-video-meta">
                                  <div
                                      className="creator-handle clickable-profile"
                                      onClick={(e) => { e.stopPropagation(); openUserProfile(activeVideo.user_id); }}
                                      title="进入作者主页"
                                  >
                                    @{activeVideo.creator_name || '未知创作者'}
                                    {activeVideo.user_id === user?.id && <span className="my-publish-badge">我的发布</span>}
                                  </div>
                                  <div className="video-caption">{activeVideo.title}{activeVideo.description && ` — ${activeVideo.description}`}</div>
                                </div>
                                <div className="web-video-controls" onClick={(e) => e.stopPropagation()}>
                                  <div className="web-video-progress-track" onClick={handleSeekVideo}><div className="web-video-progress-fill" style={{ width: `${progressPercent}%` }} /></div>
                                  <div className="web-video-controls-row">
                                    <span className="web-video-time">{formatVideoTime(playbackProgress.currentTime)} / {formatVideoTime(playbackProgress.duration)}</span>
                                    <label className="web-video-speed"><span>倍速</span><select value={playbackRate} onChange={handlePlaybackRateChange}>{PLAYBACK_SPEED_OPTIONS.map(r => <option key={r} value={r}>{r}x</option>)}</select></label>
                                  </div>
                                </div>
                              </div>

                              <div className="web-action-bar">
                                {/* 动作按钮内容 */}
                                <div
                                    className="sidebar-avatar-wrapper clickable-profile"
                                    onClick={(e) => { e.stopPropagation(); openUserProfile(activeVideo.user_id); }}
                                    title="进入作者主页"
                                >
                                  <div className="sidebar-avatar">
                                    <img src={getAvatarUrl(activeVideo)} alt="avatar" />
                                  </div>
                                  {activeVideo.user_id !== user?.id && (
                                      <button className={`follow-badge-btn ${isFollowingCreator ? (isFriendWithCreator ? 'is-friend' : 'is-following') : ''}`} onClick={(e) => handleFollowToggle(activeVideo.user_id, e)} title={isFollowingCreator ? (isFriendWithCreator ? '好友' : '取关') : '关注'}>
                                        {isFollowingCreator ? (isFriendWithCreator ? '♥' : '✓') : '+'}
                                      </button>
                                  )}
                                </div>
                                <button className={`action-item-button ${activeVideo.liked ? 'liked' : ''} ${likingVideoId === activeVideo.id ? 'is-loading' : ''}`} onClick={(e) => handleToggleLike(activeVideo.id, e)} disabled={likingVideoId === activeVideo.id}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>
                                  <span className="action-count">{activeVideo.likeCount ?? 0}</span>
                                </button>
                                <button
                                    className="action-item-button special-action"
                                    onClick={(e) => { e.stopPropagation(); openCommentsPanel(activeVideo.id); }}
                                    title="查看评论"
                                >
                                  <div className="action-icon-circle">
                                    <svg viewBox="0 0 24 24">
                                      <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
                                    </svg>
                                  </div>
                                  <span className="action-count">{activeVideo.commentCount ?? activeVideo.comments_count ?? 0}</span>
                                </button>
                                <button
                                    className={`action-item-button ${activeVideo.favorited ? 'favorited' : ''} ${favoritingVideoId === activeVideo.id ? 'is-loading' : ''}`}
                                    onClick={(e) => handleToggleFavorite(activeVideo.id, e)}
                                    disabled={favoritingVideoId === activeVideo.id}
                                    title={activeVideo.favorited ? '取消收藏' : '收藏'}
                                >
                                  <div className="action-icon-circle">
                                    <svg viewBox="0 0 24 24">
                                      {activeVideo.favorited ? (
                                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                      ) : (
                                        <path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z" />
                                      )}
                                    </svg>
                                  </div>
                                  <span className="action-count">{activeVideo.favoriteCount ?? 0}</span>
                                </button>
                                <button className="action-item-button special-action" onClick={(e) => { e.stopPropagation(); openSharePanel(activeVideo.id); }}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                  <span className="action-count">分享</span>
                                </button>
                                {renderDownloadButton(activeVideo)}
                              </div>

                              <div className="web-nav-arrows">
                                <button className="arrow-nav-btn" onClick={handlePrevVideo} disabled={currentIndex === 0}>
                                  <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg>
                                </button>
                                <button className="arrow-nav-btn" onClick={handleNextVideo} disabled={currentIndex === videos.length - 1 && !feedPagination.hasMore}>
                                  <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
                                </button>
                              </div>

                              <div className="web-feed-progress">
                                {currentIndex + 1} / {videos.length}{isLoadingMoreFeed ? ' · 加载中...' : ''}
                              </div>
                            </div>
                        ) : (
                            <div className="web-feed-center">
                              <h3>视频库空空如也</h3>
                              <p>服务器数据库中没有任何可推荐视频。</p>
                              <button className="reset-views-btn" onClick={() => setIsUploadOpen(true)}>➕ 发布全站首款视频</button>
                            </div>
                        )}
                      </main>
                  )}

                  {/* 朋友页面 */}
                  {navTab === 'friends' && (
                      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                        {/* 左侧朋友列表 */}
                        <div style={{ width: 260, flexShrink: 0, background: 'rgba(0,0,0,0.6)', borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', padding: '16px 0' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', padding: '0 16px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>我的朋友</div>
                          {isLoadingFriends ? (
                              <div style={{ textAlign: 'center', padding: 32 }}><div className="loading-spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
                          ) : friends.length > 0 ? friends.map(f => (
                              <div key={f.id}
                                   onClick={() => openFriendChat(f)}
                                   style={{
                                     display: 'flex', alignItems: 'center', gap: 12,
                                     padding: '12px 16px', cursor: 'pointer',
                                     background: activeFriend?.id === f.id ? 'rgba(186,230,253,0.12)' : 'transparent',
                                     borderLeft: activeFriend?.id === f.id ? '3px solid var(--primary-cyan)' : '3px solid transparent',
                                     transition: 'all 0.15s'
                                   }}
                              >
                                <img
                                    src={getAvatarUrl(f)}
                                    alt=""
                                    className="clickable-profile"
                                    onClick={(e) => { e.stopPropagation(); openUserProfile(f.id); }}
                                    title="进入个人主页"
                                    style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: activeFriend?.id === f.id ? '2px solid var(--primary-cyan)' : 'none' }}
                                />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: activeFriend?.id === f.id ? 'var(--primary-cyan)' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{f.username}</div>
                                  {f.displayName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{f.displayName}</div>}
                                  <div style={{ fontSize: 10, color: 'var(--primary-pink)', marginTop: 2 }}>♥ 互关好友</div>
                                </div>
                              </div>
                          )) : (
                              <div style={{ padding: '32px 20px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>还没有互关好友<br />去关注你喜欢的创作者吧</div>
                          )}
                        </div>

                        {/* 右侧聊天窗口区域 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(28, 28, 36, 0.4)', backdropFilter: 'blur(20px)', position: 'relative' }}>
                          {activeFriend ? (
                              <>
                                {/* 聊天头部 */}
                                <div style={{ height: 60, borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', padding: '0 24px', background: 'rgba(0,0,0,0.2)' }}>
                                  <img
                                      src={getAvatarUrl(activeFriend)}
                                      alt=""
                                      className="clickable-profile"
                                      onClick={() => openUserProfile(activeFriend.id)}
                                      title="进入个人主页"
                                      style={{ width: 32, height: 32, borderRadius: '50%', marginRight: 12 }}
                                  />
                                  <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>@{activeFriend.username}</span>
                                  {activeFriend.displayName && (
                                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>({activeFriend.displayName})</span>
                                  )}
                                </div>

                                {/* 消息记录 */}
                                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 100px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                                  {isLoadingChat ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                                        <div className="loading-spinner" />
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>正在加载聊天记录...</span>
                                      </div>
                                  ) : chatHistory.length > 0 ? (
                                      chatHistory.map(msg => {
                                        const isMe = msg.fromUserId === user?.id;
                                        const isTextMessage = msg.type === 'text';
                                        return (
                                            <div key={`${msg.type || 'video'}-${msg.id}`} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                                              <div style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 12, maxWidth: '75%' }}>
                                                <img
                                                    src={getAvatarUrl(isMe ? user : activeFriend)}
                                                    alt=""
                                                    style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, marginTop: 4 }}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                                                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
                                                    {formatNotificationTime(msg.createdAt)}
                                                  </span>
                                                  {isTextMessage ? (
                                                      <div
                                                          style={{
                                                            background: isMe ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.32) 0%, rgba(59, 130, 246, 0.24) 100%)' : 'rgba(255, 255, 255, 0.07)',
                                                            border: isMe ? '1px solid rgba(6, 182, 212, 0.35)' : '1px solid rgba(255, 255, 255, 0.09)',
                                                            borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                                            padding: '10px 13px',
                                                            color: '#fff',
                                                            fontSize: 14,
                                                            lineHeight: 1.55,
                                                            maxWidth: 420,
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-word',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                                          }}
                                                      >
                                                        {msg.content}
                                                      </div>
                                                  ) : (
                                                      <div
                                                          onClick={() => {
                                                            const videoItem = {
                                                              id: msg.videoId,
                                                              user_id: msg.creatorUserId,
                                                              title: msg.videoTitle,
                                                              video_url: msg.videoUrl,
                                                              cover_url: msg.videoCoverUrl,
                                                              creator_name: msg.creatorUsername
                                                            };
                                                            startSingleVideoPlayback(videoItem);
                                                          }}
                                                          style={{
                                                            background: isMe ? 'linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(59, 130, 246, 0.2) 100%)' : 'rgba(255, 255, 255, 0.05)',
                                                            border: isMe ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                                                            borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                                                            padding: 12,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                                          }}
                                                          className="chat-video-card-bubble"
                                                      >
                                                        <div style={{ fontSize: 11, color: isMe ? 'var(--primary-cyan)' : 'var(--primary-pink)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                          <span>🎥</span> {isMe ? '我分享的视频' : '分享给我的视频'}
                                                        </div>
                                                        <div style={{ position: 'relative', width: 200, height: 120, borderRadius: 8, overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                          {msg.videoCoverUrl ? (
                                                              <img src={getMediaUrl(msg.videoCoverUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                          ) : (
                                                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1c24', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>无封面</div>
                                                          )}
                                                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)', display: 'flex', alignItems: 'flex-end', padding: 8 }}>
                                                            <div style={{ fontSize: 11, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                                              @{msg.creatorUsername}
                                                            </div>
                                                          </div>
                                                          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.9, transition: 'all 0.2s' }} className="play-btn-overlay">
                                                            <svg style={{ width: 16, height: 16, fill: '#fff', marginLeft: 2 }} viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                                          </div>
                                                        </div>
                                                        <div style={{ fontSize: 13, color: '#fff', marginTop: 8, fontWeight: 500, width: 200, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.4 }}>
                                                          {msg.videoTitle || '未命名视频'}
                                                        </div>
                                                      </div>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                        );
                                      })
                                  ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                        <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                                        <p style={{ fontSize: 14, lineHeight: 1.6 }}>这里还没有分享记录<br />快在视频推荐中分享视频给他吧！</p>
                                      </div>
                                  )}
                                </div>
                                <form
                                    onSubmit={sendChatMessage}
                                    style={{
                                      position: 'absolute',
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 12,
                                      padding: '14px 20px',
                                      background: 'rgba(7, 7, 12, 0.86)',
                                      borderTop: '1px solid rgba(255,255,255,0.08)',
                                      backdropFilter: 'blur(18px)'
                                    }}
                                >
                                  <input
                                      type="text"
                                      value={chatDraft}
                                      onChange={(e) => setChatDraft(e.target.value)}
                                      placeholder={`给 @${activeFriend.username} 发消息`}
                                      maxLength={500}
                                      disabled={isSendingChat}
                                      style={{
                                        flex: 1,
                                        height: 42,
                                        borderRadius: 999,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.06)',
                                        color: '#fff',
                                        outline: 'none',
                                        padding: '0 16px',
                                        fontSize: 14
                                      }}
                                  />
                                  <button
                                      type="submit"
                                      disabled={isSendingChat || !chatDraft.trim()}
                                      style={{
                                        height: 42,
                                        minWidth: 86,
                                        borderRadius: 999,
                                        border: 'none',
                                        background: isSendingChat || !chatDraft.trim() ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg, var(--primary-cyan), #3b82f6)',
                                        color: '#fff',
                                        fontWeight: 700,
                                        cursor: isSendingChat || !chatDraft.trim() ? 'not-allowed' : 'pointer'
                                      }}
                                  >
                                    {isSendingChat ? '发送中' : '发送'}
                                  </button>
                                </form>
                              </>
                          ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                                <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
                                <p style={{ fontSize: 15 }}>选择一个朋友开始聊天</p>
                              </div>
                          )}
                        </div>
                      </div>
                  )}
                </>
            )}
            {/* 用户主页 */}
            {currentView === 'profile' && (
                <main className="user-profile-page">
                  <div className="profile-top-bar">
                    <button className="profile-back-btn" onClick={closeUserProfile} title="返回推荐">
                      <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                      返回
                    </button>
                  </div>

                  {isLoadingProfile && !profileUser ? (
                      <div className="profile-loading">
                        <div className="loading-spinner" />
                        <p>加载用户资料...</p>
                      </div>
                  ) : profileUser ? (
                      <>
                        <div
                            className={`profile-header ${profileUser.profileBackgroundUrl ? 'has-background' : ''}`}
                            style={profileUser.profileBackgroundUrl ? { backgroundImage: `url(${getProfileBackgroundUrl(profileUser)})` } : undefined}
                        >
                          {profileUserId === user?.id && (
                              <label className="profile-background-edit-btn" title="更换主页背景">
                                {isUpdatingProfileMedia ? '上传中...' : '更换背景'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={isUpdatingProfileMedia}
                                    onChange={(e) => handleProfileMediaChange('background', e.target.files?.[0])}
                                />
                              </label>
                          )}
                          <div className="profile-avatar-large-wrap">
                            <label
                                className={`profile-avatar-large ${profileUserId === user?.id ? 'editable' : ''}`}
                                title={profileUserId === user?.id ? '点击更换头像' : profileUser.username}
                            >
                              <img src={getAvatarUrl(profileUser)} alt={profileUser.username} />
                              {profileUserId === user?.id && (
                                  <>
                                    <span className="profile-avatar-edit-mask">
                                      {isUpdatingProfileMedia ? '上传中' : '更换头像'}
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        disabled={isUpdatingProfileMedia}
                                        onChange={(e) => handleProfileMediaChange('avatar', e.target.files?.[0])}
                                    />
                                  </>
                              )}
                            </label>
                            {profileUserId !== user?.id && (
                                <button
                                    type="button"
                                    className={`profile-avatar-follow-btn ${followMap[profileUserId]?.isFollowing ? (followMap[profileUserId]?.isFriend ? 'is-friend' : 'is-following') : ''}`}
                                    onClick={(e) => handleFollowToggle(profileUserId, e)}
                                    title={followMap[profileUserId]?.isFollowing ? (followMap[profileUserId]?.isFriend ? '互关好友' : '取消关注') : '关注'}
                                >
                                  {followMap[profileUserId]?.isFollowing ? (followMap[profileUserId]?.isFriend ? '♥' : '✓') : '+'}
                                </button>
                            )}
                          </div>
                          <div className="profile-info">
                            <h2>@{profileUser.username}</h2>
                            <div className="profile-id">用户 ID：{profileUser.id}</div>
                            {profileUser.displayName && (
                                <div className="profile-display-name">{profileUser.displayName}</div>
                            )}
                            <div className="profile-stats">
                              <span className="profile-stat-item">
                                <strong>{profileUser.totalLikesReceived ?? 0}</strong> 获赞
                              </span>
                              <span className="profile-stat-item">
                                <strong>{profileUser.publishedVideoCount ?? 0}</strong> 作品
                              </span>
                              {profileUserId === user?.id ? (
                                  <>
                                    <button
                                        type="button"
                                        className="profile-stat-item profile-stat-button"
                                        onClick={() => openProfileRelationModal('following')}
                                        title="查看我关注的人"
                                    >
                                      <strong>{profileUser.followingCount ?? 0}</strong> 关注
                                    </button>
                                    <button
                                        type="button"
                                        className="profile-stat-item profile-stat-button"
                                        onClick={() => openProfileRelationModal('followers')}
                                        title="查看我的粉丝"
                                    >
                                      <strong>{profileUser.followerCount ?? 0}</strong> 粉丝
                                    </button>
                                    <button
                                        type="button"
                                        className="profile-stat-item profile-stat-button"
                                        onClick={() => openProfileRelationModal('friends')}
                                        title="查看我的朋友"
                                    >
                                      <strong>{profileUser.friendCount ?? 0}</strong> 朋友
                                    </button>
                                  </>
                              ) : (
                                  <>
                                    <span className="profile-stat-item">
                                      <strong>{profileUser.followingCount ?? 0}</strong> 关注
                                    </span>
                                    <span className="profile-stat-item">
                                      <strong>{profileUser.followerCount ?? 0}</strong> 粉丝
                                    </span>
                                    <span className="profile-stat-item">
                                      <strong>{profileUser.friendCount ?? 0}</strong> 朋友
                                    </span>
                                  </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="profile-tabs">
                          <button
                              className={`profile-tab ${profileTab === 'published' ? 'active' : ''}`}
                              onClick={() => switchProfileTab('published')}
                          >
                            发布的视频
                          </button>
                          <button
                              className={`profile-tab ${profileTab === 'liked' ? 'active' : ''}`}
                              onClick={() => switchProfileTab('liked')}
                          >
                            点赞的视频
                          </button>
                          {profileUserId === user?.id && (
                            <button
                                className={`profile-tab ${profileTab === 'favorited' ? 'active' : ''}`}
                                onClick={() => switchProfileTab('favorited')}
                            >
                              收藏的视频
                            </button>
                          )}
                        </div>

                        <div className="profile-videos-section">
                          {isOwnPublishedProfile && (
                            <div className="my-videos-toolbar profile-videos-toolbar">
                              <button
                                type="button"
                                className={`my-videos-batch-toggle-btn ${batchManageMode ? 'active' : ''}`}
                                onClick={toggleBatchMode}
                              >
                                {batchManageMode ? '退出管理' : '批量管理'}
                              </button>
                              {batchManageMode && (
                                <>
                                  <button type="button" className="my-videos-batch-toggle-btn" onClick={selectAllVideos}>
                                    {selectedVideoIds.size === profileVideos.length && profileVideos.length > 0
                                      ? '取消全选'
                                      : '全选'}
                                  </button>
                                  <button
                                    type="button"
                                    className="my-videos-batch-delete-btn"
                                    disabled={selectedVideoIds.size === 0}
                                    onClick={executeBatchDelete}
                                  >
                                    批量删除 ({selectedVideoIds.size})
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {profileVideos.length > 0 ? (
                              <div className="my-videos-grid web-modal-grid profile-video-grid">
                                {profileVideos.map((pv) => (
                                    <div
                                        key={`profile-${profileTab}-${pv.id}`}
                                        className={`grid-video-card ${isOwnPublishedProfile && batchManageMode ? 'batch-selectable' : ''}`}
                                        onClick={isOwnPublishedProfile && batchManageMode
                                          ? (e) => toggleVideoSelection(pv.id, e)
                                          : () => handlePlayProfileVideo(pv)}
                                    >
                                      <img
                                          className="grid-video-cover"
                                          src={getMediaUrl(pv.cover_url)}
                                          alt={pv.title}
                                      />
                                      {isOwnPublishedProfile && batchManageMode ? (
                                        <div className={`grid-card-checkbox ${selectedVideoIds.has(pv.id) ? 'checked' : ''}`}>
                                          <svg viewBox="0 0 24 24">
                                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                          </svg>
                                        </div>
                                      ) : isOwnPublishedProfile ? (
                                        <button
                                          type="button"
                                          className="grid-card-delete-btn"
                                          onClick={(e) => handleDeleteVideo(pv.id, e)}
                                          title="删除此视频"
                                        >
                                          <svg viewBox="0 0 24 24">
                                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                                          </svg>
                                        </button>
                                      ) : null}
                                      <div className="grid-video-info">
                                        <svg viewBox="0 0 24 24">
                                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                        </svg>
                                        <span>{pv.likeCount ?? pv.likes_count ?? 0}</span>
                                      </div>
                                    </div>
                                ))}
                              </div>
                          ) : (
                              <div className="profile-videos-empty">
                                <p>{profileTab === 'published' ? '该用户还没有发布视频' : (profileTab === 'liked' ? '该用户还没有点赞任何视频' : '您还没有收藏任何视频')}</p>
                              </div>
                          )}

                          <div className="my-videos-pagination profile-pagination">
                            <button onClick={() => fetchProfileVideos(profileTab, profileUserId)}>
                              刷新
                            </button>
                            <span>{profileVideosPagination.hasMore ? '还有更多' : '已加载全部'}</span>
                            <button
                                disabled={!profileVideosPagination.hasMore}
                                onClick={() => fetchProfileVideos(
                                    profileTab,
                                    profileUserId,
                                    profileVideosPagination.nextCursor,
                                    true
                                )}
                            >
                              加载更多
                            </button>
                          </div>
                        </div>
                      </>
                  ) : (
                      <div className="profile-loading">
                        <p>用户不存在或无法加载</p>
                        <button className="reset-views-btn" onClick={closeUserProfile}>返回推荐</button>
                      </div>
                  )}
                </main>
            )}

            {currentView === 'admin' && isAdmin && (
                <main className="admin-page-main">
                  <section className="dev-console-panel admin-fullpage">
                    <div className="console-title-bar">
                      <h2><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 6h-4v2h4v2h-4v2h4v2H9V7h6v2z"/></svg>Vidora API 开发者监控面板</h2>
                      <div className="live-badge"><span className="blink-dot" />Live Connected</div>
                    </div>
                    <div className="stats-grid">
                      <div className="stats-card"><div className="stats-card-header"><span>系统总用户</span><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div><div className="stats-card-value">{devStats.users}</div></div>
                      <div className="stats-card"><div className="stats-card-header"><span>推荐视频池</span><svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></div><div className="stats-card-value">{devStats.videos}</div></div>
                      <div className="stats-card"><div className="stats-card-header"><span>全站总互动(点赞)</span><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div className="stats-card-value">{devStats.likes}</div></div>
                      <div className="stats-card highlight"><div className="stats-card-header"><span>平均 API 延迟</span><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg></div><div className="stats-card-value" style={{ color: 'var(--primary-cyan)' }}>{devStats.averageResponseTimeMs} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ms</span></div></div>
                    </div>
                    <div className="admin-console-tabs">
                      <button className={`admin-console-tab ${adminPanelTab === 'logs' ? 'active' : ''}`} onClick={() => setAdminPanelTab('logs')}>请求日志</button>
                      <button className={`admin-console-tab ${adminPanelTab === 'database' ? 'active' : ''}`} onClick={() => setAdminPanelTab('database')}>数据库视图</button>
                    </div>
                    {adminPanelTab === 'logs' ? (
                        <div className="terminal-card">
                          <div className="terminal-header"><div className="terminal-buttons"><div className="terminal-dot" /><div className="terminal-dot" /><div className="terminal-dot" /></div><div className="terminal-title">spring-boot-server-requests.log</div><button className="terminal-clear-btn" onClick={() => setDevLogs([])}>Clear</button></div>
                          <div className="terminal-console">
                            {devLogs.length > 0 ? devLogs.map((log, i) => (
                                <div key={i} className="log-row">
                                  <span className="log-timestamp">[{log.timestamp}]</span>
                                  <span className={`log-method ${log.method}`}>{log.method}</span>
                                  <span className="log-url">{log.url}</span>
                                  <span className={`log-status ${log.statusCode >= 200 && log.statusCode < 300 ? 'status-2xx' : log.statusCode >= 400 && log.statusCode < 500 ? 'status-4xx' : 'status-5xx'}`}>{log.statusCode}</span>
                                  <span className="log-duration" style={{ color: log.durationMs > 500 ? '#ff4d4d' : 'inherit' }}>{log.durationMs}ms</span>
                                  <button type="button" onClick={() => setLogDetailModal(log)} style={{ background: 'transparent', border: 0, color: 'var(--primary-cyan)', cursor: 'pointer', fontSize: 12, marginLeft: 8, padding: 0 }}>详情</button>
                                </div>
                            )) : <div className="terminal-empty-text">等待 API 网络请求中，切换到视频页操作即可看见实时 Spring Boot 拦截日志</div>}
                          </div>
                        </div>
                    ) : (
                        <div className="database-console-card">
                          <aside className="database-table-sidebar">
                            <div className="database-sidebar-title">Public Tables</div>
                            {databaseTables.map(table => (
                                <button
                                  key={table.name}
                                  type="button"
                                  className={`database-table-btn ${selectedDatabaseTable === table.name ? 'active' : ''}`}
                                  onClick={() => setSelectedDatabaseTable(table.name)}
                                >
                                  <span>{table.name}</span>
                                  <strong>{table.rowCount}</strong>
                                </button>
                            ))}
                          </aside>
                          <section className="database-table-view">
                            <div className="database-table-header">
                              <div>
                                <h3>{selectedDatabaseTable || '选择数据表'}</h3>
                                <p>{databaseTableData ? `${databaseTableData.totalRows} 行 · ${databaseTableData.columns?.length || 0} 个字段` : '管理员只读数据库视图'}</p>
                              </div>
                              <button className="terminal-clear-btn" onClick={() => fetchDatabaseTableData(selectedDatabaseTable)}>Refresh</button>
                            </div>
                            {isLoadingDatabase ? (
                                <div className="database-empty">正在读取数据库...</div>
                            ) : databaseTableData ? (
                                <>
                                  <div className="database-schema-row">
                                    {(databaseTableData.columns || []).map(column => (
                                        <span key={column.column_name}>{column.column_name}<small>{column.data_type}</small></span>
                                    ))}
                                  </div>
                                  <div className="database-data-scroll">
                                    <table className="database-data-table">
                                      <thead>
                                        <tr>
                                          {(databaseTableData.columns || []).map(column => <th key={column.column_name}>{column.column_name}</th>)}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(databaseTableData.rows || []).map((row, rowIndex) => (
                                            <tr key={row.id ?? rowIndex}>
                                              {(databaseTableData.columns || []).map(column => {
                                                const value = row[column.column_name];
                                                return <td key={column.column_name}>{value === null || value === undefined ? <span className="database-null">NULL</span> : String(value)}</td>;
                                              })}
                                            </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className="database-pagination">
                                    <button className="dev-action-btn" disabled={(databaseTableData.offset || 0) <= 0} onClick={() => fetchDatabaseTableData(selectedDatabaseTable, Math.max(0, (databaseTableData.offset || 0) - databaseTableData.limit))}>上一页</button>
                                    <span>{(databaseTableData.offset || 0) + 1} - {Math.min((databaseTableData.offset || 0) + databaseTableData.limit, databaseTableData.totalRows)} / {databaseTableData.totalRows}</span>
                                    <button className="dev-action-btn" disabled={!databaseTableData.hasMore} onClick={() => fetchDatabaseTableData(selectedDatabaseTable, (databaseTableData.offset || 0) + databaseTableData.limit)}>下一页</button>
                                  </div>
                                </>
                            ) : (
                                <div className="database-empty">暂无数据库表数据</div>
                            )}
                          </section>
                        </div>
                    )}
                    <div className="dev-controls-card">
                      <h3>🎛️ 算法与数据库交互中心</h3>
                      <div className="controls-flex">
                        <button className="dev-action-btn" onClick={fetchRecommendations}>🔍 强制同步算法推荐源</button>
                        <button className="dev-action-btn" onClick={handleResetViews}>🔄 一键清空我的"已看日志"</button>
                        <button className="dev-action-btn danger" onClick={handleDeleteAccount}>⚠️ 注销测试账户 (重置关联)</button>
                      </div>
                    </div>
                  </section>
                </main>
            )}
          </div>
        </div>

        {/* ========== MODALS ========== */}

        {/* Comments Modal */}
        {isCommentsOpen && (
            <div className="modal-overlay comments-overlay" onClick={() => setIsCommentsOpen(false)}>
              <div className="modal-content comments-panel" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={() => setIsCommentsOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>评论 ({commentsTotalCount})</h3>

                <div className="comments-list" ref={commentsListRef}>
                  {isLoadingComments && comments.length === 0 ? (
                      <div className="comments-loading">
                        <div className="loading-spinner" />
                      </div>
                  ) : comments.length > 0 ? (
                      comments.map(item => (
                          <div
                              key={item.id}
                              data-comment-id={item.id}
                              className={`comment-item ${item.justPosted ? 'just-posted' : ''} ${targetCommentId === item.id ? 'target-comment' : ''}`}
                          >
                            <div
                                className="comment-avatar clickable-profile"
                                onClick={() => { setIsCommentsOpen(false); openUserProfile(item.userId); }}
                                title="查看用户主页"
                            >
                              <img src={getAvatarUrl(item)} alt={item.username} />
                            </div>
                            <div className="comment-body">
                              <div className="comment-author-row">
                                <span
                                    className="comment-author clickable-profile"
                                    onClick={() => { setIsCommentsOpen(false); openUserProfile(item.userId); }}
                                >
                                  @{item.username}
                                </span>
                                <span className="comment-time">{formatNotificationTime(item.createdAt)}</span>
                              </div>
                              <div className="comment-text">
                                {item.content}
                              </div>
                              <button
                                  type="button"
                                  className="comment-reply-btn"
                                  onClick={() => startReplyingToComment(item)}
                              >
                                回复
                              </button>
                              {(item.replies || []).length > 0 && (
                                  <div className="comment-replies">
                                    {(item.replies || []).map(reply => (
                                        <div
                                            key={reply.id}
                                            data-comment-id={reply.id}
                                            className={`comment-reply-item ${reply.justPosted ? 'just-posted' : ''} ${targetCommentId === reply.id ? 'target-comment' : ''}`}
                                        >
                                          <div className="comment-author-row">
                                            <span
                                                className="comment-author clickable-profile"
                                                onClick={() => { setIsCommentsOpen(false); openUserProfile(reply.userId); }}
                                            >
                                              @{reply.username}
                                            </span>
                                            <span className="comment-time">{formatNotificationTime(reply.createdAt)}</span>
                                          </div>
                                          <div className="comment-text">{reply.content}</div>
                                          <button
                                              type="button"
                                              className="comment-reply-btn"
                                              onClick={() => startReplyingToComment(reply, item)}
                                          >
                                            回复
                                          </button>
                                        </div>
                                    ))}
                                  </div>
                              )}
                            </div>
                          </div>
                      ))
                  ) : (
                      <div className="comments-empty">
                        <p>还没有评论，来抢沙发吧</p>
                      </div>
                  )}
                </div>

                {commentsPagination.hasMore && (
                    <div className="comments-load-more">
                      <button
                          disabled={isLoadingComments}
                          onClick={() => fetchComments(commentsVideoId, commentsPagination.nextCursor, true)}
                      >
                        {isLoadingComments ? '加载中...' : '加载更多评论'}
                      </button>
                    </div>
                )}

                <div className="comment-compose">
                  {replyTarget && (
                      <div className="reply-target-bar">
                        <span>回复 @{replyTarget.username}</span>
                        <button type="button" onClick={cancelReply}>取消</button>
                      </div>
                  )}
                  <input
                      type="text"
                      placeholder={replyTarget ? `回复 @${replyTarget.username}...` : '写下你的评论...'}
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          handlePostComment(e);
                        }
                      }}
                      maxLength={500}
                      disabled={isPostingComment}
                  />
                  <button
                      type="button"
                      className="comment-ai-btn"
                      onClick={handleGenerateCommentReply}
                      disabled={isGeneratingCommentReply || isPostingComment || !commentDraft.trim()}
                  >
                    {isGeneratingCommentReply ? 'AI 中...' : 'AI 润色'}
                  </button>
                  <button
                      type="button"
                      onClick={handlePostComment}
                      disabled={isPostingComment || !commentDraft.trim()}
                  >
                    {isPostingComment ? '发送中...' : '发送'}
                  </button>
                </div>
              </div>
            </div>
        )}


        {/* Like Notifications Modal (F14) */}
        {isLikeNotificationsOpen && (
            <div className="modal-overlay" onClick={() => setIsLikeNotificationsOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <button className="modal-close-btn" onClick={() => setIsLikeNotificationsOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>消息通知</h3>

                <div className="like-notifications-list web-modal-list">
                  {likeNotifications.length > 0 ? (
                      likeNotifications.map(item => (
                          <div
                              key={item.likeId}
                              className={`like-notification-item ${item.read ? 'is-read' : 'is-unread'}`}
                              onClick={() => handleNotificationClick(item)}
                              role={item.type === 'comment' || item.type === 'reply' ? 'button' : undefined}
                              tabIndex={item.type === 'comment' || item.type === 'reply' ? 0 : undefined}
                              onKeyDown={(e) => {
                                if ((item.type === 'comment' || item.type === 'reply') && (e.key === 'Enter' || e.key === ' ')) {
                                  e.preventDefault();
                                  handleNotificationClick(item);
                                }
                              }}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <div className="like-notification-avatar" style={{ position: 'relative' }}>
                              <img
                                  src={getAvatarUrl({ username: item.likerUsername, displayName: item.likerDisplayName, avatarUrl: item.likerAvatarUrl })}
                                  alt={item.likerUsername}
                                  style={{ width: 36, height: 36, borderRadius: '50%' }}
                              />
                              <span style={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                background: item.type === 'like' ? 'var(--primary-pink)' : item.type === 'favorite' ? '#fbbf24' : 'var(--primary-cyan)',
                                color: '#000',
                                border: '1px solid #1e1e24'
                              }}>
                                {item.type === 'like' ? '❤️' : item.type === 'favorite' ? '⭐' : '💬'}
                              </span>
                            </div>
                            <div className="like-notification-content" style={{ flex: 1, minWidth: 0 }}>
                              <div className="like-notification-title" style={{ fontSize: 13, color: '#fff', lineHeight: 1.4 }}>
                                <strong>@{item.likerUsername}</strong>{' '}
                                {item.type === 'like' && '赞了你的视频'}
                                {item.type === 'favorite' && '收藏了你的视频'}
                                {item.type === 'comment' && `评论了你的视频：“${item.content}”`}
                                {item.type === 'reply' && `回复了你的评论：“${item.content}”`}
                              </div>
                              <div className="like-notification-video" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                🎬 {item.videoTitle || '未命名视频'}
                              </div>
                              <div className="like-notification-time" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                                {formatNotificationTime(item.likedAt)}
                              </div>
                            </div>
                            {!item.read && (
                                <span className="like-notification-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary-pink)', alignSelf: 'center' }} />
                            )}
                          </div>
                      ))
                  ) : (
                      <div className="like-notifications-empty" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.4)', gap: 12 }}>
                        <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'currentColor' }}>
                          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                        </svg>
                        <p>暂无新消息通知</p>
                      </div>
                  )}
                </div>

                <div className="my-videos-pagination">
                  <button onClick={() => fetchLikeNotifications()}>刷新</button>
                  <span>{likeNotificationsPagination.hasMore ? '还有更多通知' : '已加载全部通知'}</span>
                  <button
                      disabled={!likeNotificationsPagination.hasMore}
                      onClick={() => fetchLikeNotifications(likeNotificationsPagination.nextCursor, true)}
                  >
                    加载更多
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Publish Video Modal */}
        {isUploadOpen && (
            <div className="modal-overlay" onClick={() => !isUploading && setIsUploadOpen(false)}>
              <div className="modal-content upload-modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={() => !isUploading && setIsUploadOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>发布新短视频</h3>

                {isUploading ? (
                    <div style={{ textAlign: 'center', padding: '30px 0' }}>
                      <div className="loading-spinner" style={{ margin: '0 auto 15px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-main)', fontWeight: 500 }}>
                        {uploadStatusMsg || '视频上传切片并写入数据库中...'}
                      </p>
                      <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginTop: 8 }}>
                  进度: {uploadProgress}%
                </span>
                    </div>
                ) : (
                    <form onSubmit={handlePublish}>
                      <div className="upload-form-group">
                        <label>视频标题 *</label>
                        <input
                            type="text"
                            placeholder="输入精彩的视频标题..."
                            value={uploadTitle}
                            onChange={e => setUploadTitle(e.target.value)}
                            required
                        />
                      </div>

                      <div className="upload-form-group">
                        <label>视频描述 (选填)</label>
                        <textarea
                            placeholder="为视频添加补充说明, 支持带上 #话题 喔..."
                            value={uploadDesc}
                            onChange={e => setUploadDesc(e.target.value)}
                        />
                      </div>

                      <div className="upload-form-group">
                        <label>选择视频文件 *</label>
                        <div
                            className="file-upload-zone"
                            onClick={() => document.getElementById('video-input-file').click()}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                          </svg>
                          <p>点击选择 MP4 / WEBM / MOV 格式短视频</p>
                          <span>大小限制 100MB</span>
                          <input
                              id="video-input-file"
                              type="file"
                              accept="video/*"
                              style={{ display: 'none' }}
                              onChange={e => handleUploadVideoChange(e.target.files[0])}
                          />
                        </div>
                        {uploadVideo && (
                            <div className="file-name-indicator">
                              🎥 选定视频: {uploadVideo.name} ({(uploadVideo.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                        )}
                      </div>

                      <div className="ai-copy-panel">
                        <button
                            type="button"
                            className="ai-copy-btn"
                            onClick={handleGenerateAiCopy}
                            disabled={!uploadVideo || isGeneratingCopy}
                        >
                          {isGeneratingCopy ? 'AI 生成中...' : 'AI 生成文案'}
                        </button>
                        <span>根据视频首帧自动生成标题、简介和话题</span>
                      </div>

                      <div className="upload-form-group">
                        <div className="upload-ai-title-row">
                          <label>封面建议</label>
                          <button type="button" className="ai-mini-btn" onClick={handleGenerateCoverSuggestion} disabled={!uploadVideo || isGeneratingCoverSuggestion}>
                            {isGeneratingCoverSuggestion ? 'AI 推荐中...' : 'AI 推荐封面'}
                          </button>
                        </div>
                        <div
                            className="cover-preview-zone"
                            onClick={() => document.getElementById('cover-input-file').click()}
                        >
                          {uploadCoverPreview ? (
                              <img src={uploadCoverPreview} alt="封面预览" className="cover-preview-image" />
                          ) : (
                              <div className="cover-preview-empty">
                                <svg viewBox="0 0 24 24">
                                  <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                </svg>
                                <p>点击这里手动选择封面图片</p>
                                <span>也可以先让 AI 推荐再手动改</span>
                              </div>
                          )}
                          <input
                              id="cover-input-file"
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => handleManualCoverFileChange(e.target.files[0])}
                          />
                        </div>
                        {aiCoverSuggestion && (
                            <div className="ai-suggestion-card">
                              <div>AI 建议：第 {aiCoverSuggestion.selectedIndex + 1} 张</div>
                              <p>{aiCoverSuggestion.reason || '这张更适合做封面'}</p>
                              {aiCoverSuggestion.overlayText && <span>推荐文案：{aiCoverSuggestion.overlayText}</span>}
                            </div>
                        )}
                        {aiCoverCandidates.length > 0 && (
                            <div className="cover-candidate-grid">
                              {aiCoverCandidates.map((candidate, index) => (
                                  <button
                                      key={candidate.id}
                                      type="button"
                                      className={`cover-candidate-item ${uploadCoverPreview === candidate.url ? 'active' : ''}`}
                                      onClick={() => handleUseCoverCandidate(candidate)}
                                  >
                                    <img src={candidate.url} alt={`候选封面 ${index + 1}`} />
                                    <span>{Math.round(candidate.ratio * 100)}%</span>
                                  </button>
                              ))}
                            </div>
                        )}
                        {uploadCover && (
                            <div className="file-name-indicator cover-file">
                              🖼️ 当前封面: {uploadCover.name}
                            </div>
                        )}
                      </div>

                      <div className="ai-copy-panel">
                        <button
                            type="button"
                            className="ai-copy-btn"
                            onClick={handleGenerateCategorySuggestion}
                            disabled={!uploadVideo || isGeneratingCategorySuggestion}
                        >
                          {isGeneratingCategorySuggestion ? 'AI 分类中...' : 'AI 自动分类'}
                        </button>
                        <span>
                          {aiCategorySuggestion?.category
                            ? `当前推荐分类：${aiCategorySuggestion.category}`
                            : '根据视频内容自动判断所属分类'}
                        </span>
                      </div>

                      <div className="modal-action-row">
                        <button type="button" className="btn-secondary" onClick={() => setIsUploadOpen(false)}>
                          取消
                        </button>
                        <button type="submit" className="btn-primary">
                          立即发布短视频
                        </button>
                      </div>
                    </form>
                )}
              </div>
            </div>
        )}

        {/* Liked Videos Modal */}
        {isLikedVideosOpen && (
            <div className="modal-overlay" onClick={() => setIsLikedVideosOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <button className="modal-close-btn" onClick={() => setIsLikedVideosOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>我的喜欢 ({likedVideos.length})</h3>

                <div className="my-videos-grid web-modal-grid">
                  {likedVideos.length > 0 ? (
                      likedVideos.map((lv) => (
                          <div key={lv.id} className="grid-video-card" onClick={() => { setIsLikedVideosOpen(false); handlePlayMyVideoItem(lv); }}>
                            <img
                                className="grid-video-cover"
                                src={getMediaUrl(lv.cover_url)}
                                alt={lv.title}
                            />
                            <div className="grid-video-info">
                              <svg viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                              <span>{lv.likeCount ?? lv.likes_count ?? 0}</span>
                            </div>
                          </div>
                      ))
                  ) : (
                      <div className="my-videos-empty">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <p>你还没有点赞任何视频哦</p>
                      </div>
                  )}
                </div>

                <div className="my-videos-pagination">
                  <button onClick={() => fetchLikedVideos()}>刷新</button>
                  <span>{likedVideosPagination.hasMore ? '还有更多' : '已加载全部'}</span>
                  <button
                      disabled={!likedVideosPagination.hasMore}
                      onClick={() => fetchLikedVideos(likedVideosPagination.nextCursor, true)}
                  >
                    加载更多
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Profile Follow / Follower Modal */}
        {profileRelationModal && (
            <div className="modal-overlay" onClick={closeProfileRelationModal}>
              <div className="modal-content profile-relations-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={closeProfileRelationModal}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>{
                  profileRelationModal === 'following'
                      ? '我关注的人'
                      : profileRelationModal === 'followers'
                          ? '我的粉丝'
                          : '我的朋友'
                } ({profileRelationUsers.length})</h3>

                <div className="profile-relations-list">
                  {isLoadingProfileRelations ? (
                      <div className="profile-relations-empty">
                        <div className="loading-spinner" />
                        <span>加载中...</span>
                      </div>
                  ) : profileRelationUsers.length > 0 ? (
                      profileRelationUsers.map(u => (
                          <button
                              key={`${profileRelationModal}-${u.id}`}
                              type="button"
                              className="profile-relation-user"
                              onClick={() => openProfileFromRelationModal(u.id)}
                          >
                            <img src={getAvatarUrl(u)} alt={u.username} />
                            <span className="profile-relation-user-info">
                              <strong>@{u.username}</strong>
                              {u.displayName && <span>{u.displayName}</span>}
                            </span>
                            {u.isFriend && <span className="profile-relation-badge">好友</span>}
                          </button>
                      ))
                  ) : (
                      <div className="profile-relations-empty">
                        {profileRelationModal === 'following'
                            ? '还没有关注任何人'
                            : profileRelationModal === 'followers'
                                ? '还没有粉丝'
                                : '还没有互关好友'}
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}

        {/* Share to Friend Modal */}
        {isShareOpen && (
            <div className="modal-overlay" onClick={() => { setIsShareOpen(false); }}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <button className="modal-close-btn" onClick={() => { setIsShareOpen(false); }}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>分享视频给好友</h3>

                <div className="user-search-results" style={{ maxHeight: 300, overflowY: 'auto', marginTop: 16 }}>
                  {isLoadingFriends ? (
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>加载好友列表中...</span>
                      </div>
                  ) : friends.length > 0 ? (
                      friends.map(u => (
                          <div
                              key={u.id}
                              className="user-search-result-item"
                              onClick={() => shareVideoToUser(u.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                background: 'var(--bg-hover)', marginBottom: 6,
                                opacity: isSharing ? 0.5 : 1, pointerEvents: isSharing ? 'none' : 'auto'
                              }}
                          >
                            <img
                                src={getAvatarUrl(u)}
                                alt={u.username}
                                style={{ width: 40, height: 40, borderRadius: '50%' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                              {u.displayName && (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.displayName}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>好友</span>
                          </div>
                      ))
                  ) : (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                        你还没有互关好友。
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}

        {/* Shared Videos Modal */}
        {isSharedVideosOpen && (
            <div className="modal-overlay" onClick={() => setIsSharedVideosOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <button className="modal-close-btn" onClick={() => setIsSharedVideosOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>好友分享给我的 ({sharedVideos.length})</h3>

                <div className="my-videos-grid web-modal-grid">
                  {sharedVideos.length > 0 ? (
                      sharedVideos.map((sv) => (
                          <div key={`shared-${sv.id}`} className="grid-video-card" onClick={() => { setIsSharedVideosOpen(false); handlePlayMyVideoItem(sv); }}>
                            <img
                                className="grid-video-cover"
                                src={getMediaUrl(sv.cover_url)}
                                alt={sv.title}
                            />
                            <div className="grid-video-info">
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        来自 @{sv.shared_by || 'unknown'}
                      </span>
                            </div>
                          </div>
                      ))
                  ) : (
                      <div className="my-videos-empty">
                        <svg viewBox="0 0 24 24">
                          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" />
                        </svg>
                        <p>暂时没有好友分享视频给你</p>
                      </div>
                  )}
                </div>

                <div className="my-videos-pagination">
                  <button onClick={() => fetchSharedVideos()}>刷新</button>
                  <span>{sharedVideosPagination.hasMore ? '还有更多' : '已加载全部'}</span>
                  <button
                      disabled={!sharedVideosPagination.hasMore}
                      onClick={() => fetchSharedVideos(sharedVideosPagination.nextCursor, true)}
                  >
                    加载更多
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirm && (
            <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
                <h3 style={{ marginBottom: 8 }}>确认删除视频？</h3>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
                  此操作不可恢复，视频文件和相关记录将被永久删除。
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>取消</button>
                  <button className="btn-primary" style={{ background: '#e53935' }} onClick={confirmDeleteVideo}>确认删除</button>
                </div>
              </div>
            </div>
        )}

        {/* Log Detail Modal */}
        {logDetailModal && (
            <div className="modal-overlay" onClick={() => setLogDetailModal(null)}>
              <div
                  className="modal-content"
                  onClick={e => e.stopPropagation()}
                  style={{ maxWidth: 600, maxHeight: '80vh', overflowY: 'auto' }}
              >
                <button className="modal-close-btn" onClick={() => setLogDetailModal(null)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3 style={{ marginBottom: 16 }}>请求详情</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                  {[
                    ['时间', logDetailModal.timestamp],
                    ['方法', logDetailModal.method],
                    ['路径', logDetailModal.url],
                    ['状态码', logDetailModal.statusCode],
                    ['耗时', `${logDetailModal.durationMs}ms`],
                    ['用户 ID', logDetailModal.userId ?? '未登录'],
                    ['客户端 IP', logDetailModal.userIp],
                    ['traceId', logDetailModal.traceId],
                  ].map(([label, value]) => (
                      <div key={label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '8px 12px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                        <div
                            style={{
                              fontSize: 13,
                              color: label === '耗时' && logDetailModal.durationMs > 500 ? '#ff4d4d' : 'var(--text-main)',
                              wordBreak: 'break-all'
                            }}
                        >
                          {value}
                        </div>
                      </div>
                  ))}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Request Body</div>
                  <pre
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 6,
                        padding: 12,
                        fontSize: 12,
                        color: '#a8ff78',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 150,
                        overflowY: 'auto',
                        margin: 0
                      }}
                  >
                {formatBody(logDetailModal.requestBody)}
              </pre>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Response Body</div>
                  <pre
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 6,
                        padding: 12,
                        fontSize: 12,
                        color: '#78c8ff',
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 150,
                        overflowY: 'auto',
                        margin: 0
                      }}
                  >
                {formatBody(logDetailModal.responseBody)}
              </pre>
                </div>
              </div>
            </div>
        )}

        {toast && <div className={`toast ${toast.isError ? 'error' : ''}`}><span>{toast.message}</span></div>}
      </div>
  );
}
