import React, { useState, useEffect, useRef } from 'react';

// Backend host configuration
const API_BASE = '';
const API_PREFIX = '/api/v1';

export default function App() {
  // --- STATE SYSTEM ---
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Video feed state
  const [videos, setVideos] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [allViewed, setAllViewed] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [playTriggerAnim, setPlayTriggerAnim] = useState(false); // Play overlay animation
  const [likingVideoId, setLikingVideoId] = useState(null);

  // Modals & Drawers state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isMyVideosOpen, setIsMyVideosOpen] = useState(false);
  const [myVideos, setMyVideos] = useState([]);
  const [myVideosPagination, setMyVideosPagination] = useState({ page: 1, totalPages: 1 });

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

  // UI Toast message
  const [toast, setToast] = useState(null);

  // Ref hook to control HTML5 video player
  const videoRef = useRef(null);
  // Scroll lock to prevent high-frequency mouse wheel trigger skipping
  const scrollLockRef = useRef(false);

  // --- AUTOMATIC INITIALIZATION ---
  // Save/remove session token to localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setVideos([]);
    }
  }, [token, user]);

  // Fetch initial feed when logged in
  useEffect(() => {
    if (token) {
      fetchRecommendations();
      fetchDevDashboardData();
    }
  }, [token]);

  // Background polling loop to populate Developer Monitor Console (runs every 2 seconds)
  useEffect(() => {
    let intervalId;
    if (token) {
      intervalId = setInterval(() => {
        fetchDevDashboardData();
      }, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [token]);

  // Handle Play/Pause when switching active video index
  useEffect(() => {
    if (videos.length > 0 && videoRef.current) {
      setIsPlaying(false);
      videoRef.current.load();
      
      // Auto-play the new video once loaded
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            // Record view log on backend once the video has successfully played
            recordVideoView(videos[currentIndex].id);
          })
          .catch(err => {
            console.log("Auto-play blocked by browser. Click to play manually.", err);
          });
      }
    }
  }, [currentIndex, videos]);

  // --- HELPER UTILITIES ---
  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 4000);
  };

  // Normalize feed video fields: canonical liked / likeCount
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

  // Centralized Authenticated Fetch Wrapper
  const apiFetch = async (endpoint, options = {}) => {
    const headers = { ...options.headers };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Set JSON content-type only if it's not a multipart file upload Form
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      if (response.status === 401) {
        // Clear session if unauthorized
        setToken('');
        setUser(null);
        showToast('登录会话已过期，请重新登录', true);
        return null;
      }

      return await response.json();
    } catch (err) {
      showToast('网络请求失败，请确保后端服务已启动！', true);
      console.error(err);
      return null;
    }
  };

  // --- API SERVICE CALLS ---
  // Authenticate (Register or Login)
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
        // Clear forms
        setUsername('');
        setPassword('');
      } else {
        showToast(data.message, true);
      }
    }
  };

  // Delete My Account (注销)
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

  // Fetch recommended videos feed
  const fetchRecommendations = async () => {
    setIsLoadingFeed(true);
    const data = await apiFetch(`${API_PREFIX}/videos/recommendations`);
    setIsLoadingFeed(false);

    if (data && data.success) {
      setVideos((data.videos || []).map(normalizeFeedVideo));
      setAllViewed(data.allViewed);
      setTotalCount(data.totalCount);
      setCurrentIndex(0);
    }
  };

  // Record a view log for the current video
  const recordVideoView = async (videoId) => {
    await apiFetch(`${API_PREFIX}/videos/${videoId}/views`, { method: 'POST' });
  };

  // Toggle Video Like (点赞 / 取消点赞)
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

  // Reset entire watch history
  const handleResetViews = async () => {
    const data = await apiFetch(`${API_PREFIX}/users/me/views`, { method: 'DELETE' });
    if (data && data.success) {
      showToast(data.message);
      fetchRecommendations();
    }
  };

  // Fetch developer console metrics and logs
  const fetchDevDashboardData = async () => {
    const statsData = await apiFetch(`${API_PREFIX}/admin/stats`);
    if (statsData && statsData.success) {
      setDevStats(statsData.stats);
    }

    const logsData = await apiFetch(`${API_PREFIX}/admin/request-logs`);
    if (logsData && logsData.success) {
      setDevLogs(logsData.logs || []);
    }
  };

  // Fetch my uploaded videos (paginated)
  const fetchMyVideos = async (page = 1) => {
    const data = await apiFetch(`${API_PREFIX}/users/me/videos?page=${page}&limit=6`);
    if (data && data.success) {
      setMyVideos((data.videos || []).map(normalizeFeedVideo));
      setMyVideosPagination({
        page: data.pagination.page,
        totalPages: data.pagination.totalPages
      });
    }
  };

  // Handle publishing video
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

    // Fake progress loading interval
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
        // Clear forms
        setUploadTitle('');
        setUploadDesc('');
        setUploadVideo(null);
        setUploadCover(null);

        // Refresh feed & developer counts
        fetchRecommendations();
        fetchDevDashboardData();
      } else if (data) {
        showToast(data.message, true);
      }
    }, 300);
  };

  // Handle deleting a custom video
  const handleDeleteVideo = async (videoId, e) => {
    e.stopPropagation(); // Avoid triggering video cover clicks
    if (!window.confirm("确定要删除这个视频吗？")) return;

    const data = await apiFetch(`${API_PREFIX}/videos/${videoId}`, { method: 'DELETE' });
    if (data && data.success) {
      showToast('视频已成功下架！');
      // Refresh my videos grid
      fetchMyVideos(myVideosPagination.page);
      
      // Refresh feed & developer counts
      fetchRecommendations();
      fetchDevDashboardData();
    }
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
    
    // Trigger double-click size effect
    setPlayTriggerAnim(true);
    setTimeout(() => setPlayTriggerAnim(false), 500);
  };

  const handleNextVideo = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      showToast('👏 您已看完所有推荐！点击侧边栏的“重置”即可从头刷起！');
    }
  };

  const handlePrevVideo = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  // High-precision debounced mouse scroll event listener
  const handleWheel = (e) => {
    // If transition lock is active, ignore scroll event to prevent skipping multiple videos
    if (scrollLockRef.current) return;

    if (e.deltaY > 30) {
      // Scroll Down -> Next video
      if (currentIndex < videos.length - 1) {
        scrollLockRef.current = true;
        setCurrentIndex(prev => prev + 1);
        setTimeout(() => {
          scrollLockRef.current = false;
        }, 800); // 800ms lock duration matching video switch transition
      } else {
        showToast('👏 您已看完所有推荐！点击侧边栏的“重置”即可从头刷起！');
      }
    } else if (e.deltaY < -30) {
      // Scroll Up -> Previous video
      if (currentIndex > 0) {
        scrollLockRef.current = true;
        setCurrentIndex(prev => prev - 1);
        setTimeout(() => {
          scrollLockRef.current = false;
        }, 800);
      }
    }
  };

  const openMyVideosPanel = () => {
    setIsMyVideosOpen(true);
    fetchMyVideos(1);
  };

  // --- RENDERING SCREENS ---
  // Auth Screen (Login/Register)
  if (!token) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-icon">
              {/* Custom SVG Douyin Logo */}
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

  // Active user details
  const activeVideo = videos[currentIndex];

  return (
    <div className="dashboard-container">
      {/* --- DASHBOARD HEADER --- */}
      <header className="dashboard-header">
        <div className="logo-area">
          <div className="mini-logo">
            <svg viewBox="0 0 24 24">
              <path d="M12.53.07C13.74 0 14.8.08 15.65.17c0 1.25.33 2.37.98 3.32.74 1.09 1.83 1.83 3.07 2.18.52.15 1.05.24 1.8.29v3.42c-.93 0-1.78-.18-2.61-.55-.78-.35-1.5-.86-2.07-1.52v7.7c0 1.63-.44 3.09-1.32 4.25-1.12 1.48-2.82 2.35-4.8 2.35-1.53 0-2.92-.51-3.95-1.52C5.7 19.16 5.11 17.57 5.11 15.68c0-1.84.58-3.41 1.64-4.52C7.8 10.12 9.21 9.6 10.74 9.6c.58 0 1.13.08 1.79.25v3.6c-.53-.18-1.07-.27-1.63-.27-.82 0-1.55.28-2.09.8-.57.54-.88 1.3-.88 2.27 0 .97.31 1.72.88 2.26.54.52 1.27.8 2.09.8.84 0 1.58-.28 2.12-.8.57-.54.89-1.29.89-2.26V.07z" />
            </svg>
          </div>
          <h1>抖音短视频</h1>
          <span>前后端分离 Spring Boot + React 开发平台</span>
        </div>

        <div className="user-profile-widget">
          <div className="user-info">
            <div className="username">UID: {user?.id} • {user?.username}</div>
            <div className="role">系统开发者 / 体验员</div>
          </div>
          <button className="logout-btn danger" onClick={handleDeleteAccount}>
            注销账户
          </button>
          <button className="logout-btn" onClick={() => setToken('')}>
            <svg style={{ width: 14, height: 14, fill: 'currentColor' }} viewBox="0 0 24 24">
              <path d="M16 13v-2H7V9l-5 4 5 4v-2h9zM20 3h-9c-1.1 0-2 .9-2 2v4h2V5h9v14h-9v-4H9v4c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
            </svg>
            安全退出
          </button>
        </div>
      </header>

      {/* --- DASHBOARD CONTENT Split --- */}
      <main className="dashboard-main">
        
        {/* --- 1. SMARTPHONE FEED VIEW (LEFT) --- */}
        <section className="app-view-panel">
          
          {/* Feed Scrolling Arrow (Prev) */}
          <div className="phone-scroll-arrows arrow-prev">
            <button
              className="arrow-nav-btn"
              onClick={handlePrevVideo}
              disabled={currentIndex === 0 || allViewed}
              title="上滑视频"
            >
              <svg style={{ width: 20, height: 20, fill: 'currentColor' }} viewBox="0 0 24 24">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
              </svg>
            </button>
          </div>

          {/* Actual Smartphone Wrapper */}
          <div className="phone-mockup">
            <div className="phone-screen">
              
              {/* Watch indicator */}
              <div className="phone-home-indicator" />

              {/* Feed Logic */}
              {isLoadingFeed ? (
                <div className="phone-loading-screen">
                  <div className="loading-spinner" />
                  <p>算法组装中...</p>
                </div>
              ) : allViewed ? (
                <div className="feed-empty-screen">
                  <div className="empty-icon-glow">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
                    </svg>
                  </div>
                  <h3>推荐已看完</h3>
                  <p>
                    推荐算法通过您的“已看日志”识别了用户喜好，所有库里的视频已经过滤完毕。
                  </p>
                  <button className="reset-views-btn" onClick={handleResetViews}>
                    🔄 重置浏览历史以重新排序
                  </button>
                </div>
              ) : videos.length > 0 && activeVideo ? (
                <div className="tiktok-feed" onWheel={handleWheel}>
                  
                  {/* Custom HTML5 Video Player */}
                  <div className="tiktok-video-wrapper" onClick={togglePlayState}>
                    <video
                      ref={videoRef}
                      className="tiktok-video"
                      loop
                      playsInline
                      src={getMediaUrl(activeVideo.video_url)}
                      poster={activeVideo.cover_url ? getMediaUrl(activeVideo.cover_url) : undefined}
                    />

                    {/* Double Click / Play Indicator Overlay */}
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
                  </div>

                  {/* Video Meta Info Bottom Overlay */}
                  <div className="video-meta-overlay">
                    <div className="creator-handle">
                      @{activeVideo.creator_name || '未知创作者'}
                      {activeVideo.user_id === user?.id && <span>我的发布</span>}
                    </div>
                    <div className="video-caption">
                      {activeVideo.title} {activeVideo.description && `— ${activeVideo.description}`}
                    </div>
                    <div className="video-hashtags">#智能算法推荐 #SpringBoot #React</div>
                  </div>

                  {/* Right Action floating icons */}
                  <div className="video-action-sidebar">
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
                      aria-label={activeVideo.liked ? '取消点赞' : '点赞'}
                      title={activeVideo.liked ? '取消点赞' : '点赞'}
                    >
                      <div className="action-icon-circle">
                        <svg viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </div>
                      <span className="action-count">{activeVideo.likeCount ?? 0}</span>
                    </button>

                    {/* Quick Reset Views log */}
                    <button className="action-item-button special-action" onClick={handleResetViews} title="重置观看日志">
                      <div className="action-icon-circle">
                        <svg viewBox="0 0 24 24">
                          <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                        </svg>
                      </div>
                      <span className="action-count" style={{ color: 'var(--primary-cyan)' }}>重置已看</span>
                    </button>

                    {/* Publish video trigger */}
                    <button className="action-item-button special-action" onClick={() => setIsUploadOpen(true)} title="发布我的新视频">
                      <div className="action-icon-circle publish-icon">
                        <svg viewBox="0 0 24 24">
                          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                        </svg>
                      </div>
                      <span className="action-count publish-label">发视频</span>
                    </button>

                    {/* My videos listing trigger */}
                    <button className="action-item-button special-action" onClick={openMyVideosPanel} title="管理我的视频">
                      <div className="action-icon-circle">
                        <svg viewBox="0 0 24 24">
                          <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z" />
                        </svg>
                      </div>
                      <span className="action-count">我的作品</span>
                    </button>
                  </div>

                </div>
              ) : (
                <div className="feed-empty-screen">
                  <h3>视频库空空如也</h3>
                  <p>服务器数据库中没有任何可推荐视频。</p>
                  <button className="reset-views-btn" onClick={() => setIsUploadOpen(true)}>
                    ➕ 发布全站首款视频
                  </button>
                </div>
              )}

              {/* Grid of My Videos sliding overlay in smartphone */}
              {isMyVideosOpen && (
                <div className="phone-overlay-panel">
                  <div className="panel-header">
                    <h3>我的作品 ({myVideos.length})</h3>
                    <button className="panel-close-btn" onClick={() => setIsMyVideosOpen(false)}>
                      <svg style={{ width: 20, height: 20, fill: 'currentColor' }} viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>

                  <div className="my-videos-grid">
                    {myVideos.length > 0 ? (
                      myVideos.map(mv => (
                        <div key={mv.id} className="grid-video-card">
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
                      disabled={myVideosPagination.page === 1}
                      onClick={() => fetchMyVideos(myVideosPagination.page - 1)}
                    >
                      上一页
                    </button>
                    <span>第 {myVideosPagination.page} / {myVideosPagination.totalPages || 1} 页</span>
                    <button
                      disabled={myVideosPagination.page >= myVideosPagination.totalPages}
                      onClick={() => fetchMyVideos(myVideosPagination.page + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Feed Scrolling Arrow (Next) */}
          <div className="phone-scroll-arrows arrow-next">
            <button
              className="arrow-nav-btn"
              onClick={handleNextVideo}
              disabled={currentIndex === videos.length - 1 || allViewed}
              title="下滑视频"
            >
              <svg style={{ width: 20, height: 20, fill: 'currentColor' }} viewBox="0 0 24 24">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>
          </div>

        </section>

        {/* --- 2. DEVELOPER MONITORING DASHBOARD PANEL (RIGHT) --- */}
        <section className="dev-console-panel">
          
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
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 2 22 6.48 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
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
                    <span className="log-duration">{log.durationMs}ms</span>
                  </div>
                ))
              ) : (
                <div className="terminal-empty-text">
                  ⌨️ 等待 API 网络请求中... 触发左侧手机交互即可看见实时 Spring Boot 拦截日志！
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
                🔄 一键清空我的“已看日志”
              </button>
              <button className="dev-action-btn danger" onClick={handleDeleteAccount}>
                ⚠️ 注销测试账户 (重置关联)
              </button>
            </div>
          </div>

        </section>

      </main>

      {/* --- --- --- --- --- --- --- --- --- --- --- --- */}
      {/* --- MODAL SYSTEM (PUBLISH VIDEO) --- */}
      {/* --- --- --- --- --- --- --- --- --- --- --- --- */}
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
                  视频上传切片并写入 H2 数据库中...
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

      {/* --- --- --- --- --- --- --- --- --- --- --- --- */}
      {/* --- SYSTEM TOAST NOTIFICATIONS --- */}
      {/* --- --- --- --- --- --- --- --- --- --- --- --- */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
