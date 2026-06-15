import React, { useState, useEffect, useRef } from 'react';

// Backend host configuration
const API_BASE = '';
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
  const [followingUsers, setFollowingUsers] = useState([]);
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(false);
  const [selectedFollowingUser, setSelectedFollowingUser] = useState(null);

  // Modals & Drawers state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMyVideosOpen, setIsMyVideosOpen] = useState(false);
  const [myVideos, setMyVideos] = useState([]);
  const [myVideosPagination, setMyVideosPagination] = useState({ nextCursor: null, hasMore: false });
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
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  // User profile page
  const [profileUserId, setProfileUserId] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [profileTab, setProfileTab] = useState('published');
  const [profileVideos, setProfileVideos] = useState([]);
  const [profileVideosPagination, setProfileVideosPagination] = useState({ nextCursor: null, hasMore: false });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Video upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadVideo, setUploadVideo] = useState(null);
  const [uploadCover, setUploadCover] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusMsg, setUploadStatusMsg] = useState('');

  // Live Developer Stats & Logs dashboard
  const [devStats, setDevStats] = useState({ users: 0, videos: 0, likes: 0, views: 0, averageResponseTimeMs: 0, totalRequestsLogged: 0 });
  const [devLogs, setDevLogs] = useState([]);
  const [logDetailModal, setLogDetailModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // UI Toast message
  const [toast, setToast] = useState(null);

  const videoRef = useRef(null);
  const scrollLockRef = useRef(false);
  const touchStartRef = useRef({ y: 0 });
  const videoStageRef = useRef(null);
  const loadingMoreFeedRef = useRef(false);
  const curatedFeedRef = useRef(false);
  const preloadedMediaRef = useRef([]);

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
      intervalId = setInterval(() => {
        fetchDevDashboardData();
      }, 10000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [token, user?.role, currentView]);

  useEffect(() => {
    let intervalId;
    if (token) {
      fetchLikeNotificationUnreadCount();
      intervalId = setInterval(() => {
        fetchLikeNotificationUnreadCount();
      }, 15000);
    } else {
      setLikeNotificationUnreadCount(0);
      setLikeNotifications([]);
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
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const normalizeFeedVideo = (video) => {
    if (!video) return video;
    const liked = typeof video.liked === 'boolean' ? video.liked : (video.is_liked === 1 || video.is_liked === true);
    const likeCount = video.likeCount ?? video.likes_count ?? video.likesCount ?? 0;
    const commentCount = video.commentCount ?? video.comments_count ?? 0;
    return {
      ...video,
      liked,
      likeCount,
      commentCount,
      comments_count: commentCount,
      is_liked: liked ? 1 : 0,
      likes_count: likeCount,
      likesCount: likeCount,
    };
  };

  const updateVideoLikeState = (videoId, liked, likeCount) => {
    setVideos(prev => prev.map(v => {
      if (v.id !== videoId) return v;
      return normalizeFeedVideo({ ...v, liked, likeCount });
    }));
    setMyVideos(prev => prev.map(v => {
      if (v.id !== videoId) return v;
      return normalizeFeedVideo({ ...v, liked, likeCount });
    }));
    setProfileVideos(prev => prev.map(v => {
      if (v.id !== videoId) return v;
      return normalizeFeedVideo({ ...v, liked, likeCount });
    }));
  };

  const updateVideoCommentCount = (videoId, commentCount) => {
    const patch = (v) => v.id === videoId
        ? { ...v, comments_count: commentCount, commentCount }
        : v;
    setVideos(prev => prev.map(patch));
    setMyVideos(prev => prev.map(patch));
    setProfileVideos(prev => prev.map(patch));
  };

  const getAvatarUrl = (userOrSeed) => {
    if (userOrSeed && typeof userOrSeed === 'object') {
      if (userOrSeed.avatarUrl) return getMediaUrl(userOrSeed.avatarUrl);
      const seed = userOrSeed.username || userOrSeed.displayName || 'user';
      return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
    }
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${userOrSeed || 'user'}`;
  };

  const getMediaUrl = (url) => {
    if (!url) return '';
    return url.startsWith('http') ? url : `${API_BASE}${url}`;
  };

  const apiFetch = async (endpoint, options = {}) => {
    const { silent = false, timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
    const headers = { ...fetchOptions.headers };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
    const endpoint = authMode === 'register' ? `${API_PREFIX}/auth/register` : `${API_PREFIX}/auth/login`;
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
    const data = await apiFetch(`${API_PREFIX}/videos/recommendations?limit=10${cursorParam}`);
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
      data = await apiFetch(`${API_PREFIX}/videos/featured?limit=24${cursorParam}`);
      if ((!data || !data.success) && !append) {
        const fallback = await apiFetch(`${API_PREFIX}/videos/recommendations?limit=24`);
        if (fallback && fallback.success) {
          data = fallback;
        }
      }
    } else {
      data = await apiFetch(`${API_PREFIX}/videos/search?q=${encodeURIComponent(category.keyword || category.label)}`);
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
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/like`, { method: 'PUT' });
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
      const response = await fetch(`${API_BASE}${API_PREFIX}/videos/${video.id}/download`, {
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

  const fetchMyVideos = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/videos?limit=6${cursorParam}`);
    if (data && data.success) {
      const fetchedVideos = (data.videos || []).map(normalizeFeedVideo);
      setMyVideos(prev => append ? [...prev, ...fetchedVideos] : fetchedVideos);
      setMyVideosPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const fetchLikedVideos = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/liked-videos?limit=8${cursorParam}`);
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
    const data = await apiFetch(`${API_PREFIX}/users/search?q=${encodeURIComponent(query.trim())}`);
    setIsSearchingUsers(false);
    if (data && data.success) {
      setUserSearchResults(data.users || []);
    }
  };

  const shareVideoToUser = async (toUserId) => {
    setIsSharing(true);
    const data = await apiFetch(`${API_PREFIX}/videos/${shareTargetVideoId}/share`, {
      method: 'POST',
      body: JSON.stringify({ toUserId }),
      headers: { 'Content-Type': 'application/json' }
    });
    setIsSharing(false);
    if (data && data.success) {
      showToast('视频转发成功！');
      setIsShareOpen(false);
      setUserSearchQuery('');
      setUserSearchResults([]);
    } else if (data) {
      showToast(data.message || '转发失败', true);
    }
  };

  const fetchSharedVideos = async (cursor = null, append = false) => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/users/me/shared-videos?limit=8${cursorParam}`);
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
    const data = await apiFetch(`${API_PREFIX}/users/me/like-notifications/read`, { method: 'PUT' });
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

  const openCommentsPanel = async (videoId) => {
    setCommentsVideoId(videoId);
    setIsCommentsOpen(true);
    setCommentDraft('');
    setComments([]);
    await fetchComments(videoId);
  };

  const fetchComments = async (videoId, cursor = null, append = false) => {
    setIsLoadingComments(true);
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}/comments?limit=20${cursorParam}`);
    setIsLoadingComments(false);
    if (data && data.success) {
      setComments(prev => append ? [...prev, ...(data.comments || [])] : data.comments || []);
      setCommentsTotalCount(data.totalCount ?? 0);
      setCommentsPagination({
        nextCursor: data.pagination?.nextCursor ?? null,
        hasMore: data.pagination?.hasMore ?? false
      });
    }
  };

  const handlePostComment = async (e) => {
    e?.preventDefault();
    const content = commentDraft.trim();
    if (!content || !commentsVideoId || isPostingComment) return;

    setIsPostingComment(true);
    const data = await apiFetch(`${API_PREFIX}/videos/${commentsVideoId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
    setIsPostingComment(false);

    if (data && data.success) {
      setCommentDraft('');
      const newCount = data.commentsCount ?? commentsTotalCount + 1;
      setCommentsTotalCount(newCount);
      updateVideoCommentCount(commentsVideoId, newCount);
      if (data.comment) {
        setComments(prev => [data.comment, ...prev]);
      } else {
        await fetchComments(commentsVideoId);
      }
      showToast('评论发表成功');
    } else if (data) {
      showToast(data.message || '评论失败', true);
    }
  };

  const openUserProfile = async (userId) => {
    if (!userId) return;
    setProfileUserId(userId);
    setProfileTab('published');
    setProfileVideos([]);
    setProfileVideosPagination({ nextCursor: null, hasMore: false });
    setProfileUser(null);
    setCurrentView('profile');
    setIsLoadingProfile(true);
    await fetchUserProfile(userId);
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
    setCurrentView('feed');
    if (navTab === 'mine') {
      setNavTab('recommend');
    }
    setProfileUserId(null);
    setProfileUser(null);
    setProfileVideos([]);
  };

  const fetchUserProfile = async (userId) => {
    const data = await apiFetch(`${API_PREFIX}/users/${userId}`);
    if (data && data.success) {
      setProfileUser(data.user);
    } else {
      showToast(data?.message || '无法加载用户资料', true);
    }
  };

  const fetchProfileVideos = async (tab, userId, cursor = null, append = false) => {
    const targetId = userId ?? profileUserId;
    if (!targetId) return;
    const endpoint = tab === 'liked'
        ? `${API_PREFIX}/users/${targetId}/liked-videos`
        : `${API_PREFIX}/users/${targetId}/videos`;
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
    const data = await apiFetch(`${API_PREFIX}/users/${targetUserId}/relation`, { silent: true });
    if (data && data.success) {
      setFollowMap(prev => ({ ...prev, [targetUserId]: { isFollowing: data.isFollowing, isFriend: data.isFriend } }));
    }
  };

  const handleFollowToggle = async (targetUserId, e) => {
    e?.stopPropagation();
    if (!token) { showToast('请先登录', true); return; }
    if (targetUserId === user?.id) return;
    const isFollowing = followMap[targetUserId]?.isFollowing;
    const data = await apiFetch(`${API_PREFIX}/users/${targetUserId}/follow`, { method: isFollowing ? 'DELETE' : 'POST' });
    if (data && data.success) {
      showToast(data.message);
      setFollowMap(prev => ({ ...prev, [targetUserId]: { isFollowing: !isFollowing, isFriend: data.isFriend ?? false } }));
      if (navTab === 'friends') fetchFriends();
      if (navTab === 'following') fetchFollowing();
    } else if (data) showToast(data.message, true);
  };

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults(null); return; }
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      const data = await apiFetch(`${API_PREFIX}/videos/search?q=${encodeURIComponent(q.trim())}`);
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

  const fetchFriends = async () => {
    setIsLoadingFriends(true);
    const data = await apiFetch(`${API_PREFIX}/users/me/friends`);
    setIsLoadingFriends(false);
    if (data && data.success) setFriends(data.friends || []);
  };

  const fetchFollowing = async () => {
    setIsLoadingFollowing(true);
    const data = await apiFetch(`${API_PREFIX}/users/me/following`);
    setIsLoadingFollowing(false);
    if (data && data.success) setFollowingUsers(data.users || []);
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
      body: formData
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
        } else {
          fetchRecommendations();
        }
        fetchMyVideos();
        if (user?.role === 'ADMIN' && currentView === 'admin') {
          fetchDevDashboardData();
        }
      } else if (data) {
        showToast(data.message, true);
      }
    }, 300);
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
      fetchMyVideos();
      fetchRecommendations();
      if (user?.role === 'ADMIN' && currentView === 'admin') {
        fetchDevDashboardData();
      }
    } else if (data) {
      showToast(data.message || '删除失败', true);
    }
  };

  const handlePlayMyVideo = (index) => {
    curatedFeedRef.current = true;
    loadingMoreFeedRef.current = false;
    setIsLoadingMoreFeed(false);
    setFeedPagination({ nextCursor: null, hasMore: false });
    setVideos(myVideos);
    setCurrentIndex(index);
    setIsMyVideosOpen(false);
    setAllViewed(false);
    setNavTab('recommend');
    setCurrentView('feed');
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
    setPlaybackProgress({
      currentTime: videoRef.current.currentTime || 0,
      duration: Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0
    });
  };

  const handleVideoLoadedMetadata = () => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = playbackRate;
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

  const openMyVideosPanel = () => {
    setIsMyVideosOpen(true);
    fetchMyVideos();
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
              <div className="logo-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M12.53.07C13.74 0 14.8.08 15.65.17c0 1.25.33 2.37.98 3.32.74 1.09 1.83 1.83 3.07 2.18.52.15 1.05.24 1.8.29v3.42c-.93 0-1.78-.18-2.61-.55-.78-.35-1.5-.86-2.07-1.52v7.7c0 1.63-.44 3.09-1.32 4.25-1.12 1.48-2.82 2.35-4.8 2.35-1.53 0-2.92-.51-3.95-1.52C5.7 19.16 5.11 17.57 5.11 15.68c0-1.84.58-3.41 1.64-4.52C7.8 10.12 9.21 9.6 10.74 9.6c.58 0 1.13.08 1.79.25v3.6c-.53-.18-1.07-.27-1.63-.27-.82 0-1.55.28-2.09.8-.57.54-.88 1.3-.88 2.27 0 .97.31 1.72.88 2.26.54.52 1.27.8 2.09.8.84 0 1.58-.28 2.12-.8.57-.54.89-1.29.89-2.26V.07z" />
                </svg>
              </div>
              <h2>抖音短视频架构平台</h2>
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
    const data = await apiFetch(`${API_PREFIX}/videos/search?q=${encodeURIComponent(q.trim())}`);
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
            <div className="mini-logo">
              <svg viewBox="0 0 24 24">
                <path d="M12.53.07C13.74 0 14.8.08 15.65.17c0 1.25.33 2.37.98 3.32.74 1.09 1.83 1.83 3.07 2.18.52.15 1.05.24 1.8.29v3.42c-.93 0-1.78-.18-2.61-.55-.78-.35-1.5-.86-2.07-1.52v7.7c0 1.63-.44 3.09-1.32 4.25-1.12 1.48-2.82 2.35-4.8 2.35-1.53 0-2.92-.51-3.95-1.52C5.7 19.16 5.11 17.57 5.11 15.68c0-1.84.58-3.41 1.64-4.52C7.8 10.12 9.21 9.6 10.74 9.6c.58 0 1.13.08 1.79.25v3.6c-.53-.18-1.07-.27-1.63-.27-.82 0-1.55.28-2.09.8-.57.54-.88 1.3-.88 2.27 0 .97.31 1.72.88 2.26.54.52 1.27.8 2.09.8.84 0 1.58-.28 2.12-.8.57-.54.89-1.29.89-2.26V.07z" />
              </svg>
            </div>
            <h1>抖音短视频</h1>
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
                                    <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} alt="" className="search-avatar" />
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
                  <button className="header-quick-btn like-notification-trigger" onClick={openLikeNotificationsPanel} title="点赞通知">
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>
                      {likeNotificationUnreadCount > 0 && (
                          <span className="header-notification-badge">
            {likeNotificationUnreadCount > 99 ? '99+' : likeNotificationUnreadCount}
          </span>
                      )}
                    </div>
                    <span>点赞通知</span>
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
                                  <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} alt="" className="search-user-avatar" />
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

                  {/* 关注页：左侧用户列表 + 右侧视频 */}
                  {navTab === 'following' && (
                      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
                        <div style={{ width: 260, flexShrink: 0, background: 'rgba(0,0,0,0.6)', borderRight: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto', padding: '16px 0' }}>
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
                                <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`} alt="" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: selectedFollowingUser?.id === u.id ? '2px solid var(--primary-cyan)' : 'none' }} />
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
                          {!selectedFollowingUser ? (
                              <div className="web-feed-center">
                                <div style={{ fontSize: 48, marginBottom: 16 }}>👈</div>
                                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>从左侧选择一个关注的人<br />查看他发布的视频</p>
                              </div>
                          ) : isLoadingFeed ? (
                              <div className="web-feed-center"><div className="loading-spinner" /><p>加载中...</p></div>
                          ) : videos.length > 0 && activeVideo ? (
                              <div className="web-video-stage" ref={videoStageRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                                <div className="web-video-bg" style={{ backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.4) saturate(1.5)', transform: 'scale(1.1)' }} />
                                <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                                  <video ref={videoRef} className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`} loop muted={isMuted} preload="metadata" playsInline
                                         src={getMediaUrl(activeVideo.video_url)} poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                                         onTimeUpdate={handleVideoTimeUpdate} onLoadedMetadata={handleVideoLoadedMetadata} onError={handleVideoPlaybackError} />
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
                                    <div className="video-hashtags">#智能算法推荐 #SpringBoot #React</div>
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
                                      <img src={getAvatarUrl(activeVideo.creator_name)} alt="avatar" />
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
                                  <button className="action-item-button special-action" onClick={(e) => { e.stopPropagation(); openSharePanel(activeVideo.id); }}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                    <span className="action-count">转发</span>
                                  </button>
                                  {renderDownloadButton(activeVideo)}
                                  <button className="action-item-button special-action" onClick={openMyVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg></div>
                                    <span className="action-count">我的作品</span>
                                  </button>
                                  <button className="action-item-button special-action" onClick={openLikedVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>
                                    <span className="action-count">我的喜欢</span>
                                  </button>
                                  <button className="action-item-button special-action" onClick={openSharedVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                    <span className="action-count">分享给我</span>
                                  </button>
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
                              <div className="web-feed-center"><p>@{selectedFollowingUser.username} 还没有发布任何视频</p></div>
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
                            <div className="web-video-stage" ref={videoStageRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                              <div className="web-video-bg" style={{ backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.4) saturate(1.5)', transform: 'scale(1.1)' }} />
                              <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                                <video ref={videoRef} className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`} loop muted={isMuted} preload="metadata" playsInline
                                       src={getMediaUrl(activeVideo.video_url)} poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                                       onTimeUpdate={handleVideoTimeUpdate} onLoadedMetadata={handleVideoLoadedMetadata} onError={handleVideoPlaybackError} />
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
                                  <div className="video-hashtags">#智能算法推荐 #SpringBoot #React</div>
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
                                    <img src={getAvatarUrl(activeVideo.creator_name)} alt="avatar" />
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
                                <button className="action-item-button special-action" onClick={(e) => { e.stopPropagation(); openSharePanel(activeVideo.id); }}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                  <span className="action-count">转发</span>
                                </button>
                                {renderDownloadButton(activeVideo)}
                                <button className="action-item-button special-action" onClick={openMyVideosPanel}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg></div>
                                  <span className="action-count">我的作品</span>
                                </button>
                                <button className="action-item-button special-action" onClick={openLikedVideosPanel}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>
                                  <span className="action-count">我的喜欢</span>
                                </button>
                                <button className="action-item-button special-action" onClick={openSharedVideosPanel}>
                                  <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                  <span className="action-count">分享给我</span>
                                </button>
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
                                   onClick={() => fetchUserVideos(f)}
                                   style={{
                                     display: 'flex', alignItems: 'center', gap: 12,
                                     padding: '12px 16px', cursor: 'pointer',
                                     background: selectedFollowingUser?.id === f.id ? 'rgba(186,230,253,0.12)' : 'transparent',
                                     borderLeft: selectedFollowingUser?.id === f.id ? '3px solid var(--primary-cyan)' : '3px solid transparent',
                                     transition: 'all 0.15s'
                                   }}
                              >
                                <img src={`https://api.dicebear.com/7.x/bottts/svg?seed=${f.username}`} alt="" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, border: selectedFollowingUser?.id === f.id ? '2px solid var(--primary-cyan)' : 'none' }} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: selectedFollowingUser?.id === f.id ? 'var(--primary-cyan)' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{f.username}</div>
                                  {f.displayName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{f.displayName}</div>}
                                  <div style={{ fontSize: 10, color: 'var(--primary-pink)', marginTop: 2 }}>♥ 互关好友</div>
                                </div>
                              </div>
                          )) : (
                              <div style={{ padding: '32px 20px', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>还没有互关好友<br />去关注你喜欢的创作者吧</div>
                          )}
                        </div>

                        {/* 右侧视频区域 */}
                        <main className="web-feed-main" style={{ flex: 1 }}>
                          {!selectedFollowingUser ? (
                              <div className="web-feed-center">
                                <div style={{ fontSize: 48, marginBottom: 16 }}>👈</div>
                                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>从左侧选择一个朋友<br />查看他发布的视频</p>
                              </div>
                          ) : isLoadingFeed ? (
                              <div className="web-feed-center"><div className="loading-spinner" /><p>加载中...</p></div>
                          ) : videos.length > 0 && activeVideo ? (
                              <div className="web-video-stage" ref={videoStageRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                                <div className="web-video-bg" style={{ backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) brightness(0.4) saturate(1.5)', transform: 'scale(1.1)' }} />
                                <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                                  <video ref={videoRef} className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`} loop muted={isMuted} preload="metadata" playsInline
                                         src={getMediaUrl(activeVideo.video_url)} poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                                         onTimeUpdate={handleVideoTimeUpdate} onLoadedMetadata={handleVideoLoadedMetadata} onError={handleVideoPlaybackError} />
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
                                    <div className="video-hashtags">#智能算法推荐 #SpringBoot #React</div>
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
                                      <img src={getAvatarUrl(activeVideo.creator_name)} alt="avatar" />
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
                                  <button className="action-item-button special-action" onClick={(e) => { e.stopPropagation(); openSharePanel(activeVideo.id); }}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                    <span className="action-count">转发</span>
                                  </button>
                                  {renderDownloadButton(activeVideo)}
                                  <button className="action-item-button special-action" onClick={openMyVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/></svg></div>
                                    <span className="action-count">我的作品</span>
                                  </button>
                                  <button className="action-item-button special-action" onClick={openLikedVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>
                                    <span className="action-count">我的喜欢</span>
                                  </button>
                                  <button className="action-item-button special-action" onClick={openSharedVideosPanel}>
                                    <div className="action-icon-circle"><svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg></div>
                                    <span className="action-count">分享给我</span>
                                  </button>
                                </div>
                                <div className="web-nav-arrows">
                                  <button className="arrow-nav-btn" onClick={handlePrevVideo} disabled={currentIndex === 0}><svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" /></svg></button>
                                  <button className="arrow-nav-btn" onClick={handleNextVideo} disabled={currentIndex === videos.length - 1 && !feedPagination.hasMore}><svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg></button>
                                </div>
                                <div className="web-feed-progress">{currentIndex + 1} / {videos.length}{isLoadingMoreFeed ? ' · 加载中...' : ''}</div>
                              </div>
                          ) : (
                              <div className="web-feed-center"><p>@{selectedFollowingUser.username} 还没有发布任何视频</p></div>
                          )}
                        </main>
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
                        <div className="profile-header">
                          <div className="profile-avatar-large">
                            <img src={getAvatarUrl(profileUser)} alt={profileUser.username} />
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
                        </div>

                        <div className="profile-videos-section">
                          {profileVideos.length > 0 ? (
                              <div className="my-videos-grid web-modal-grid profile-video-grid">
                                {profileVideos.map((pv) => (
                                    <div
                                        key={`profile-${profileTab}-${pv.id}`}
                                        className="grid-video-card"
                                        onClick={() => handlePlayProfileVideo(pv)}
                                    >
                                      <img
                                          className="grid-video-cover"
                                          src={getMediaUrl(pv.cover_url)}
                                          alt={pv.title}
                                      />
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
                                <p>{profileTab === 'published' ? '该用户还没有发布视频' : '该用户还没有点赞任何视频'}</p>
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
                      <h2><svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 6h-4v2h4v2h-4v2h4v2H9V7h6v2z"/></svg>抖音 API 开发者监控面板</h2>
                      <div className="live-badge"><span className="blink-dot" />Live Connected</div>
                    </div>
                    <div className="stats-grid">
                      <div className="stats-card"><div className="stats-card-header"><span>系统总用户</span><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div><div className="stats-card-value">{devStats.users}</div></div>
                      <div className="stats-card"><div className="stats-card-header"><span>推荐视频池</span><svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg></div><div className="stats-card-value">{devStats.videos}</div></div>
                      <div className="stats-card"><div className="stats-card-header"><span>全站总互动(点赞)</span><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div><div className="stats-card-value">{devStats.likes}</div></div>
                      <div className="stats-card highlight"><div className="stats-card-header"><span>平均 API 延迟</span><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg></div><div className="stats-card-value" style={{ color: 'var(--primary-cyan)' }}>{devStats.averageResponseTimeMs} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ms</span></div></div>
                    </div>
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
                        )) : <div className="terminal-empty-text">⌨️ 等待 API 网络请求中... 切换到"视频"页操作即可看见实时 Spring Boot 拦截日志！</div>}
                      </div>
                    </div>
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

                <div className="comments-list">
                  {isLoadingComments && comments.length === 0 ? (
                      <div className="comments-loading">
                        <div className="loading-spinner" />
                      </div>
                  ) : comments.length > 0 ? (
                      comments.map(item => (
                          <div key={item.id} className="comment-item">
                            <div
                                className="comment-avatar clickable-profile"
                                onClick={() => { setIsCommentsOpen(false); openUserProfile(item.userId); }}
                                title="查看用户主页"
                            >
                              <img src={getAvatarUrl(item.username)} alt={item.username} />
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
                              <div className="comment-text">{item.content}</div>
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

                <form className="comment-compose" onSubmit={handlePostComment}>
                  <input
                      type="text"
                      placeholder="写下你的评论..."
                      value={commentDraft}
                      onChange={e => setCommentDraft(e.target.value)}
                      maxLength={500}
                      disabled={isPostingComment}
                  />
                  <button type="submit" disabled={isPostingComment || !commentDraft.trim()}>
                    {isPostingComment ? '发送中...' : '发送'}
                  </button>
                </form>
              </div>
            </div>
        )}

        {/* My Videos Modal */}
        {isMyVideosOpen && (
            <div className="modal-overlay" onClick={() => setIsMyVideosOpen(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
                <button className="modal-close-btn" onClick={() => setIsMyVideosOpen(false)}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>我的作品 ({myVideos.length})</h3>

                <div className="my-videos-grid web-modal-grid">
                  {myVideos.length > 0 ? (
                      myVideos.map((mv, idx) => (
                          <div key={mv.id} className="grid-video-card" onClick={() => handlePlayMyVideo(idx)}>
                            <img
                                className="grid-video-cover"
                                src={getMediaUrl(mv.cover_url)}
                                alt={mv.title}
                            />
                            <button
                                className="grid-card-delete-btn"
                                onClick={(e) => handleDeleteVideo(mv.id, e)}
                                title="删除此视频"
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                              </svg>
                            </button>
                            <div className="grid-video-info">
                              <svg viewBox="0 0 24 24">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                              </svg>
                              <span>{mv.likeCount ?? mv.likesCount ?? mv.likes_count ?? 0}</span>
                            </div>
                          </div>
                      ))
                  ) : (
                      <div className="my-videos-empty">
                        <svg viewBox="0 0 24 24">
                          <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 9l-6 4.5-6 4.5z" />
                        </svg>
                        <p>您还没有发布任何作品喔</p>
                      </div>
                  )}
                </div>

                <div className="my-videos-pagination">
                  <button onClick={() => fetchMyVideos()}>刷新</button>
                  <span>{myVideosPagination.hasMore ? '还有更多作品' : '已加载全部作品'}</span>
                  <button
                      disabled={!myVideosPagination.hasMore}
                      onClick={() => fetchMyVideos(myVideosPagination.nextCursor, true)}
                  >
                    加载更多
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

                <h3>谁赞了我的视频</h3>

                <div className="like-notifications-list web-modal-list">
                  {likeNotifications.length > 0 ? (
                      likeNotifications.map(item => (
                          <div
                              key={item.likeId}
                              className={`like-notification-item ${item.read ? 'is-read' : 'is-unread'}`}
                          >
                            <div className="like-notification-avatar">
                              <img
                                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${item.likerUsername}`}
                                  alt={item.likerUsername}
                              />
                            </div>
                            <div className="like-notification-content">
                              <div className="like-notification-title">
                                <strong>@{item.likerUsername}</strong> 赞了你的视频
                              </div>
                              <div className="like-notification-video">{item.videoTitle}</div>
                              <div className="like-notification-time">{formatNotificationTime(item.likedAt)}</div>
                            </div>
                            {!item.read && <span className="like-notification-dot" aria-hidden="true" />}
                          </div>
                      ))
                  ) : (
                      <div className="like-notifications-empty">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                        <p>还没有人赞过你的作品</p>
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
              <div className="modal-content" onClick={e => e.stopPropagation()}>
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
                              onChange={e => setUploadVideo(e.target.files[0])}
                              required
                          />
                        </div>
                        {uploadVideo && (
                            <div className="file-name-indicator">
                              🎥 选定视频: {uploadVideo.name} ({(uploadVideo.size / 1024 / 1024).toFixed(2)} MB)
                            </div>
                        )}
                      </div>

                      <div className="upload-form-group">
                        <label>上传封面图片 (选填)</label>
                        <div
                            className="file-upload-zone"
                            onClick={() => document.getElementById('cover-input-file').click()}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                          </svg>
                          <p>点击选择封面配图 (JPG / PNG / WEBP)</p>
                          <span>若不传封面，系统将自动截取视频第一帧作为封面</span>
                          <input
                              id="cover-input-file"
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={e => setUploadCover(e.target.files[0])}
                          />
                        </div>
                        {uploadCover && (
                            <div className="file-name-indicator cover-file">
                              🖼️ 选定封面: {uploadCover.name}
                            </div>
                        )}
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

        {/* Share to Friend Modal */}
        {isShareOpen && (
            <div className="modal-overlay" onClick={() => { setIsShareOpen(false); setUserSearchQuery(''); setUserSearchResults([]); }}>
              <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <button className="modal-close-btn" onClick={() => { setIsShareOpen(false); setUserSearchQuery(''); setUserSearchResults([]); }}>
                  <svg viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>

                <h3>转发视频给好友</h3>

                <div style={{ marginBottom: 16 }}>
                  <input
                      className="user-search-input"
                      type="text"
                      placeholder="搜索用户 (输入用户名)..."
                      value={userSearchQuery}
                      onChange={e => {
                        setUserSearchQuery(e.target.value);
                        searchUsers(e.target.value);
                      }}
                      autoFocus
                  />
                </div>

                <div className="user-search-results" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {isSearchingUsers ? (
                      <div style={{ textAlign: 'center', padding: 20 }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 10px' }} />
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>搜索中...</span>
                      </div>
                  ) : userSearchResults.length > 0 ? (
                      userSearchResults.map(u => (
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
                                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                                alt={u.username}
                                style={{ width: 40, height: 40, borderRadius: '50%' }}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>@{u.username}</div>
                              {u.displayName && (
                                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.displayName}</div>
                              )}
                            </div>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {u.id}</span>
                          </div>
                      ))
                  ) : userSearchQuery.trim() ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                        未找到匹配的用户
                      </div>
                  ) : (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                        输入用户名搜索好友
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