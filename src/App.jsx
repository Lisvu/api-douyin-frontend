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

export default function App() {
  // --- STATE SYSTEM ---
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(loadStoredUser());
  const [isCheckingSession, setIsCheckingSession] = useState(!!localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // View switching: 'feed' (用户视频页) | 'admin' (管理员监控台)
  const [currentView, setCurrentView] = useState('feed');

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
  const [isVideoZoomed, setIsVideoZoomed] = useState(false);

  // Modals & Drawers state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMyVideosOpen, setIsMyVideosOpen] = useState(false);
  const [myVideos, setMyVideos] = useState([]);
  const [myVideosPagination, setMyVideosPagination] = useState({ nextCursor: null, hasMore: false });
  const [isLikeNotificationsOpen, setIsLikeNotificationsOpen] = useState(false);
  const [likeNotifications, setLikeNotifications] = useState([]);
  const [likeNotificationUnreadCount, setLikeNotificationUnreadCount] = useState(0);
  const [likeNotificationsPagination, setLikeNotificationsPagination] = useState({ nextCursor: null, hasMore: false });

  // Video upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadVideo, setUploadVideo] = useState(null);
  const [uploadCover, setUploadCover] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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
  const preloadedMediaRef = useRef([]);


  useEffect(() => {
    const el = videoStageRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [currentIndex, videos.length, allViewed, feedPagination, isLoadingMoreFeed]);

  // --- AUTOMATIC INITIALIZATION ---
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setVideos([]);
      setCurrentView('feed');
    }
  }, [token, user]);

  useEffect(() => {
    if (token) {
      initializeAuthenticatedSession();
    }
  }, [token]);

  // Background polling for admin dashboard (ADMIN only, and only when on admin view)
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

  // Poll like notification unread count when logged in (F14)
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

  // Handle Play/Pause when switching active video index
  useEffect(() => {
    if (currentView !== 'feed') {
      if (videoRef.current) videoRef.current.pause();
      return;
    }
    if (videos.length > 0 && videoRef.current) {
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

  // Keyboard navigation: ArrowUp / ArrowDown to switch videos (F03)
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

  // --- HELPER UTILITIES ---
  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const normalizeFeedVideo = (video) => {
    if (!video) return video;
    const liked = typeof video.liked === 'boolean'
        ? video.liked
        : (video.is_liked === 1 || video.is_liked === true);
    const likeCount = video.likeCount ?? video.likes_count ?? video.likesCount ?? 0;
    return {
      ...video,
      liked,
      likeCount,
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
          fetchRecommendations(),
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

  // --- API SERVICE CALLS ---
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

  const recordVideoView = async (videoId) => {
    await apiFetch(`${API_PREFIX}/videos/${videoId}/views`, { method: 'POST' });
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

    if (!data) {
      return;
    }

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
    const data = await apiFetch(`${API_PREFIX}/users/me/views`, { method: 'DELETE' });
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
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('title', uploadTitle);
    formData.append('description', uploadDesc);
    formData.append('video', uploadVideo);
    if (uploadCover) {
      formData.append('cover', uploadCover);
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

      if (data && data.success) {
        showToast('🎉 视频发布成功！已加入算法推荐池！');
        setIsUploadOpen(false);
        setUploadTitle('');
        setUploadDesc('');
        setUploadVideo(null);
        setUploadCover(null);

        fetchRecommendations();
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
    setVideos(myVideos);
    setCurrentIndex(index);
    setIsMyVideosOpen(false);
    setAllViewed(false);
    setCurrentView('feed');
  };

  // --- ACTIONS INTERFACE ---
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
    // loadMoreFeed closes over the latest cursor state listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const formatBody = (body) => {
    if (!body || body.trim() === '') return '(empty)';
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  };

  // --- RENDERING SCREENS ---
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
                <input
                    type="text"
                    placeholder="输入用户名"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                />
              </div>
              <div className="input-group">
                <label>密码</label>
                <input
                    type="password"
                    placeholder="输入密码"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                />
              </div>

              <button type="submit" className="auth-btn">
                {authMode === 'login' ? '开启平台' : '立即注册'}
              </button>
            </form>

            <div className="auth-switch">
              {authMode === 'login' ? (
                  <>
                    没有账户？ <span onClick={() => setAuthMode('register')}>立即注册</span>
                  </>
              ) : (
                  <>
                    已有账户？ <span onClick={() => setAuthMode('login')}>直接登录</span>
                  </>
              )}
            </div>
          </div>

          {toast && (
              <div className={`toast ${toast.isError ? 'error' : ''}`}>
                <span>{toast.message}</span>
              </div>
          )}
        </div>
    );
  }

  const activeVideo = videos[currentIndex];
  const isAdmin = user?.role === 'ADMIN';

  return (
      <div className="webapp-container">
        {/* --- TOP NAVIGATION BAR --- */}
        <header className="webapp-header">
          <div className="logo-area">
            <div className="mini-logo">
              <svg viewBox="0 0 24 24">
                <path d="M12.53.07C13.74 0 14.8.08 15.65.17c0 1.25.33 2.37.98 3.32.74 1.09 1.83 1.83 3.07 2.18.52.15 1.05.24 1.8.29v3.42c-.93 0-1.78-.18-2.61-.55-.78-.35-1.5-.86-2.07-1.52v7.7c0 1.63-.44 3.09-1.32 4.25-1.12 1.48-2.82 2.35-4.8 2.35-1.53 0-2.92-.51-3.95-1.52C5.7 19.16 5.11 17.57 5.11 15.68c0-1.84.58-3.41 1.64-4.52C7.8 10.12 9.21 9.6 10.74 9.6c.58 0 1.13.08 1.79.25v3.6c-.53-.18-1.07-.27-1.63-.27-.82 0-1.55.28-2.09.8-.57.54-.88 1.3-.88 2.27 0 .97.31 1.72.88 2.26.54.52 1.27.8 2.09.8.84 0 1.58-.28 2.12-.8.57-.54.89-1.29.89-2.26V.07z" />
              </svg>
            </div>
            <h1>抖音短视频</h1>
          </div>

          {/* View switcher: only visible to ADMIN */}
          {isAdmin && (
              <nav className="view-switcher">
                <button
                    className={`view-tab ${currentView === 'feed' ? 'active' : ''}`}
                    onClick={() => setCurrentView('feed')}
                >
                  🎬 视频
                </button>
                <button
                    className={`view-tab ${currentView === 'admin' ? 'active' : ''}`}
                    onClick={() => setCurrentView('admin')}
                >
                  📊 监控台
                </button>
              </nav>
          )}

          <div className="user-profile-widget">
            <div className="user-info">
              <div className="username">UID: {user?.id} • {user?.username}</div>
              <div className="role">
                {isAdmin ? '🔧 系统管理员' : '👤 普通用户'}
              </div>
            </div>
            <button className="logout-btn danger" onClick={handleDeleteAccount}>
              注销账户
            </button>
            <button className="logout-btn" onClick={() => { setToken(''); setUser(null); }}>
              <svg style={{ width: 14, height: 14, fill: 'currentColor' }} viewBox="0 0 24 24">
                <path d="M16 13v-2H7V9l-5 4 5 4v-2h9zM20 3h-9c-1.1 0-2 .9-2 2v4h2V5h9v14h-9v-4H9v4c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
              </svg>
              安全退出
            </button>
          </div>
        </header>

        {/* ============================================== */}
        {/* VIEW 1: FULLSCREEN VIDEO FEED (抖音网页版风格)   */}
        {/* ============================================== */}
        {currentView === 'feed' && (
            <main className="web-feed-main">
              {isLoadingFeed ? (
                  <div className="web-feed-center">
                    <div className="loading-spinner" />
                    <p>算法组装中...</p>
                  </div>
              ) : allViewed ? (
                  <div className="web-feed-center">
                    <div className="empty-icon-glow">
                      <svg viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                      </svg>
                    </div>
                    <h3>推荐已看完</h3>
                    <p>推荐算法通过您的"已看日志"识别了用户喜好，所有库里的视频已经过滤完毕。</p>
                    <button className="reset-views-btn" onClick={handleResetViews}>
                      🔄 重置浏览历史以重新排序
                    </button>
                  </div>
              ) : videos.length > 0 && activeVideo ? (
                  <div
                      className="web-video-stage"
                      ref={videoStageRef}
                      onTouchStart={handleTouchStart}
                      onTouchEnd={handleTouchEnd}
                  >
                    {/* 模糊背景 */}
                    <div
                        className="web-video-bg"
                        style={{
                          backgroundImage: `url(${getMediaUrl(activeVideo.cover_url)})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          filter: 'blur(40px) brightness(0.4) saturate(1.5)',
                          transform: 'scale(1.1)',
                        }}
                    />

                    {/* Center video player */}
                    <div className={`web-video-wrapper ${isVideoZoomed ? 'is-zoomed' : ''}`} onClick={togglePlayState}>
                      <video
                          ref={videoRef}
                          className={`web-video-player ${isVideoZoomed ? 'is-zoomed' : ''}`}
                          loop
                          muted={isMuted}
                          preload="metadata"
                          playsInline
                          src={getMediaUrl(activeVideo.video_url)}
                          poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                      />

                      {/* Play/Pause animation overlay */}
                      <div className="video-play-overlay">
                        {playTriggerAnim && (
                            <div className="play-pause-icon-anim">
                              {isPlaying ? (
                                  <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              ) : (
                                  <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                              )}
                            </div>
                        )}
                      </div>

                      {/* Mute toggle */}
                      <button className="web-mute-button" onClick={toggleMuted} title={isMuted ? '打开声音' : '静音'}>
                        {isMuted ? (
                            <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.62 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73L16.25 17.52c-.67.52-1.43.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                        )}
                      </button>

                      <button
                          className="web-zoom-button"
                          onClick={toggleVideoZoom}
                          title={isVideoZoomed ? '还原视频大小' : '放大视频'}
                      >
                        {isVideoZoomed ? (
                            <svg viewBox="0 0 24 24"><path d="M5 14h2v3h3v2H5v-5zm12 3v-3h2v5h-5v-2h3zM7 7v3H5V5h5v2H7zm12 3h-2V7h-3V5h5v5z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24"><path d="M15 3h6v6h-2V6.41l-4.29 4.3-1.42-1.42 4.3-4.29H15V3zM9 21H3v-6h2v2.59l4.29-4.3 1.42 1.42-4.3 4.29H9V21zm12 0h-6v-2h2.59l-4.3-4.29 1.42-1.42 4.29 4.3V15h2v6zM3 9V3h6v2H6.41l4.3 4.29-1.42 1.42-4.29-4.3V9H3z"/></svg>
                        )}
                      </button>

                      {/* Bottom video meta */}
                      <div className="web-video-meta">
                        <div className="creator-handle">
                          @{activeVideo.creator_name || '未知创作者'}
                          {activeVideo.user_id === user?.id && <span className="my-publish-badge">我的发布</span>}
                        </div>
                        <div className="video-caption">
                          {activeVideo.title} {activeVideo.description && `— ${activeVideo.description}`}
                        </div>
                        <div className="video-hashtags">#智能算法推荐 #SpringBoot #React</div>
                      </div>
                    </div>

                    {/* Right floating action bar */}
                    <div className="web-action-bar">
                      <div className="sidebar-avatar-wrapper">
                        <div className="sidebar-avatar">
                          <img
                              src={`https://api.dicebear.com/7.x/bottts/svg?seed=${activeVideo.creator_name}`}
                              alt="avatar"
                          />
                        </div>
                        <div className="sidebar-follow-badge" title="关注作者">
                          <svg viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                          </svg>
                        </div>
                      </div>

                      {/* Like button */}
                      <button
                          className={`action-item-button ${activeVideo.liked ? 'liked' : ''} ${likingVideoId === activeVideo.id ? 'is-loading' : ''}`}
                          onClick={(e) => handleToggleLike(activeVideo.id, e)}
                          disabled={likingVideoId === activeVideo.id}
                          aria-pressed={activeVideo.liked}
                          title={activeVideo.liked ? '取消点赞' : '点赞'}
                      >
                        <div className="action-icon-circle">
                          <svg viewBox="0 0 24 24">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                          </svg>
                        </div>
                        <span className="action-count">{activeVideo.likeCount ?? 0}</span>
                      </button>

                      {/* Reset views */}
                      <button className="action-item-button special-action" onClick={handleResetViews} title="重置观看日志">
                        <div className="action-icon-circle">
                          <svg viewBox="0 0 24 24">
                            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                          </svg>
                        </div>
                        <span className="action-count">重置已看</span>
                      </button>

                      {/* Publish */}
                      <button className="action-item-button special-action" onClick={() => setIsUploadOpen(true)} title="发布我的新视频">
                        <div className="action-icon-circle publish-icon">
                          <svg viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                          </svg>
                        </div>
                        <span className="action-count publish-label">发视频</span>
                      </button>

                      {/* Like notifications (F14) */}
                      <button
                          className="action-item-button special-action like-notification-trigger"
                          onClick={openLikeNotificationsPanel}
                          title="谁赞了我的视频"
                      >
                        <div className="action-icon-circle">
                          <svg viewBox="0 0 24 24">
                            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" />
                          </svg>
                          {likeNotificationUnreadCount > 0 && (
                              <span className="notification-badge">
                                {likeNotificationUnreadCount > 99 ? '99+' : likeNotificationUnreadCount}
                              </span>
                          )}
                        </div>
                        <span className="action-count">点赞通知</span>
                      </button>

                      {/* My videos */}
                      <button className="action-item-button special-action" onClick={openMyVideosPanel} title="管理我的视频">
                        <div className="action-icon-circle">
                          <svg viewBox="0 0 24 24">
                            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
                          </svg>
                        </div>
                        <span className="action-count">我的作品</span>
                      </button>
                    </div>

                    {/* Prev/Next navigation arrows (far right, like douyin web) */}
                    <div className="web-nav-arrows">
                      <button
                          className="arrow-nav-btn"
                          onClick={handlePrevVideo}
                          disabled={currentIndex === 0}
                          title="上一个视频"
                      >
                        <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24">
                          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
                        </svg>
                      </button>
                      <button
                          className="arrow-nav-btn"
                          onClick={handleNextVideo}
                          disabled={currentIndex === videos.length - 1 && !feedPagination.hasMore}
                          title="下一个视频"
                      >
                        <svg style={{ width: 22, height: 22, fill: 'currentColor' }} viewBox="0 0 24 24">
                          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                        </svg>
                      </button>
                    </div>

                    {/* Progress indicator */}
                    <div className="web-feed-progress">
                      {currentIndex + 1} / {videos.length}{isLoadingMoreFeed ? ' · 加载中...' : ''}
                    </div>
                  </div>
              ) : (
                  <div className="web-feed-center">
                    <h3>视频库空空如也</h3>
                    <p>服务器数据库中没有任何可推荐视频。</p>
                    <button className="reset-views-btn" onClick={() => setIsUploadOpen(true)}>
                      ➕ 发布全站首款视频
                    </button>
                  </div>
              )}
            </main>
        )}

        {/* ============================================== */}
        {/* VIEW 2: ADMIN MONITORING CONSOLE (仅管理员)      */}
        {/* ============================================== */}
        {currentView === 'admin' && isAdmin && (
            <main className="admin-page-main">
              <section className="dev-console-panel admin-fullpage">

                <div className="console-title-bar">
                  <h2>
                    <svg viewBox="0 0 24 24">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4 6h-4v2h4v2h-4v2h4v2H9V7h6v2z" />
                    </svg>
                    抖音 API 开发者监控面板
                  </h2>
                  <div className="live-badge">
                    <span className="blink-dot" />
                    Live Connected
                  </div>
                </div>

                {/* Stats Widgets Grid */}
                <div className="stats-grid">
                  <div className="stats-card">
                    <div className="stats-card-header">
                      <span>系统总用户</span>
                      <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    </div>
                    <div className="stats-card-value">{devStats.users}</div>
                  </div>

                  <div className="stats-card">
                    <div className="stats-card-header">
                      <span>推荐视频池</span>
                      <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                    </div>
                    <div className="stats-card-value">{devStats.videos}</div>
                  </div>

                  <div className="stats-card">
                    <div className="stats-card-header">
                      <span>全站总互动(点赞)</span>
                      <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    </div>
                    <div className="stats-card-value">{devStats.likes}</div>
                  </div>

                  <div className="stats-card highlight">
                    <div className="stats-card-header">
                      <span>平均 API 延迟</span>
                      <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                    </div>
                    <div className="stats-card-value" style={{ color: 'var(--primary-cyan)' }}>
                      {devStats.averageResponseTimeMs} <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ms</span>
                    </div>
                  </div>
                </div>

                {/* Terminal Console for scrolling logs */}
                <div className="terminal-card">
                  <div className="terminal-header">
                    <div className="terminal-buttons">
                      <div className="terminal-dot" />
                      <div className="terminal-dot" />
                      <div className="terminal-dot" />
                    </div>
                    <div className="terminal-title">spring-boot-server-requests.log</div>
                    <button className="terminal-clear-btn" onClick={() => setDevLogs([])}>
                      Clear
                    </button>
                  </div>

                  <div className="terminal-console">
                    {devLogs.length > 0 ? (
                        devLogs.map((log, i) => (
                            <div key={i} className="log-row">
                              <span className="log-timestamp">[{log.timestamp}]</span>
                              <span className={`log-method ${log.method}`}>{log.method}</span>
                              <span className="log-url">{log.url}</span>
                              <span className={`log-status ${log.statusCode >= 200 && log.statusCode < 300 ? 'status-2xx' : log.statusCode >= 400 && log.statusCode < 500 ? 'status-4xx' : 'status-5xx'}`}>
                        {log.statusCode}
                      </span>
                              <span className="log-duration" style={{ color: log.durationMs > 500 ? '#ff4d4d' : 'inherit' }}>
                        {log.durationMs}ms
                      </span>
                              <button
                                  type="button"
                                  onClick={() => setLogDetailModal(log)}
                                  style={{
                                    background: 'transparent',
                                    border: 0,
                                    color: 'var(--primary-cyan)',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    marginLeft: 8,
                                    padding: 0
                                  }}
                              >
                                详情
                              </button>
                            </div>
                        ))
                    ) : (
                        <div className="terminal-empty-text">
                          ⌨️ 等待 API 网络请求中... 切换到"视频"页操作即可看见实时 Spring Boot 拦截日志！
                        </div>
                    )}
                  </div>
                </div>

                {/* Developer Quick Controllers */}
                <div className="dev-controls-card">
                  <h3>🎛️ 算法与数据库交互中心</h3>
                  <div className="controls-flex">
                    <button className="dev-action-btn" onClick={fetchRecommendations}>
                      🔍 强制同步算法推荐源
                    </button>
                    <button className="dev-action-btn" onClick={handleResetViews}>
                      🔄 一键清空我的"已看日志"
                    </button>
                    <button className="dev-action-btn danger" onClick={handleDeleteAccount}>
                      ⚠️ 注销测试账户 (重置关联)
                    </button>
                  </div>
                </div>

              </section>
            </main>
        )}

        {/* ============================================== */}
        {/* MODALS                                          */}
        {/* ============================================== */}

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
                  <button
                      onClick={() => fetchMyVideos()}
                  >
                    刷新
                  </button>
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
                  <button
                      onClick={() => fetchLikeNotifications()}
                  >
                    刷新
                  </button>
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
                        视频上传切片并写入数据库中...
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
                          <span>若不传封面，系统将自动生成彩色抽象渐变图占位</span>
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

        {/* Toast */}
        {toast && (
            <div className={`toast ${toast.isError ? 'error' : ''}`}>
              <span>{toast.message}</span>
            </div>
        )}
      </div>


  );
}
