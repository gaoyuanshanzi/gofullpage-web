// GoFullPage Web - Client Logic
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // Elements
  const urlInput = document.getElementById('urlInput');
  const clearUrlBtn = document.getElementById('clearUrlBtn');
  const formatSelect = document.getElementById('formatSelect');
  const viewportSelect = document.getElementById('viewportSelect');
  const captureBtn = document.getElementById('captureBtn');
  const livePreviewFrame = document.getElementById('livePreviewFrame');
  const refreshLiveFrameBtn = document.getElementById('refreshLiveFrameBtn');
  const openExternalUrlBtn = document.getElementById('openExternalUrlBtn');
  const sampleUrlBtns = document.querySelectorAll('.sample-url-btn');

  // State Containers
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const previewState = document.getElementById('previewState');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryBtn');

  // Preview elements
  const pngViewer = document.getElementById('pngViewer');
  const pdfViewer = document.getElementById('pdfViewer');
  const htmlViewer = document.getElementById('htmlViewer');
  const previewImage = document.getElementById('previewImage');
  const previewHtmlCode = document.getElementById('previewHtmlCode');
  const htmlLinesCount = document.getElementById('htmlLinesCount');
  const pdfDownloadLink = document.getElementById('pdfDownloadLink');

  // Metadata elements
  const previewFileName = document.getElementById('previewFileName');
  const previewFileSize = document.getElementById('previewFileSize');
  const previewDimension = document.getElementById('previewDimension');
  const previewDuration = document.getElementById('previewDuration');
  const resultBadge = document.getElementById('resultBadge');

  // Action Buttons
  const downloadBtn = document.getElementById('downloadBtn');
  const directSaveBtn = document.getElementById('directSaveBtn');
  const copyContentBtn = document.getElementById('copyContentBtn');
  const fullscreenModalBtn = document.getElementById('fullscreenModalBtn');
  const fullscreenModal = document.getElementById('fullscreenModal');
  const modalPreviewImage = document.getElementById('modalPreviewImage');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  // Current capture state
  let currentResult = null;
  let currentBlobUrl = null;
  let captureHistory = JSON.parse(localStorage.getItem('gofullpage_history') || '[]');

  // Helper: Format bytes
  function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  // Toast Notification
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('toast-visible');
    setTimeout(() => {
      toast.classList.remove('toast-visible');
    }, 3000);
  }

  // Sync Live Preview Frame
  function updateLiveFrame(rawUrl) {
    let url = (rawUrl || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    try {
      livePreviewFrame.src = url;
      openExternalUrlBtn.href = url;
    } catch (e) {
      console.warn('Invalid URL for iframe', e);
    }
  }

  // Debounced URL Input handler
  let urlDebounce = null;
  urlInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearUrlBtn.classList.toggle('hidden', val.length === 0);
    clearTimeout(urlDebounce);
    urlDebounce = setTimeout(() => {
      updateLiveFrame(val);
    }, 600);
  });

  clearUrlBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearUrlBtn.classList.add('hidden');
    urlInput.focus();
  });

  refreshLiveFrameBtn.addEventListener('click', () => {
    updateLiveFrame(urlInput.value);
  });

  // Sample URL Pill Clicks
  sampleUrlBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      urlInput.value = url;
      clearUrlBtn.classList.remove('hidden');
      updateLiveFrame(url);
    });
  });

  // UI State Switcher
  function setState(state) {
    emptyState.classList.toggle('hidden', state !== 'empty');
    loadingState.classList.toggle('hidden', state !== 'loading');
    errorState.classList.toggle('hidden', state !== 'error');
    previewState.classList.toggle('hidden', state !== 'preview');

    const isDone = state === 'preview';
    downloadBtn.disabled = !isDone;
    copyContentBtn.disabled = !isDone;
    fullscreenModalBtn.disabled = !(isDone && currentResult && currentResult.format === 'png');
    resultBadge.classList.toggle('hidden', !isDone);
    captureBtn.disabled = state === 'loading';
  }

  // Stepper progress simulator
  let progressInterval = null;
  function startProgressAnimation() {
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');

    // Reset steps
    [step1, step2, step3].forEach((el) => {
      el.className = 'step-item flex items-center gap-3 text-xs opacity-40';
    });

    step1.className = 'step-item flex items-center gap-3 text-xs step-active';

    let elapsed = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      elapsed += 500;
      if (elapsed >= 1500 && elapsed < 4000) {
        step1.className = 'step-item flex items-center gap-3 text-xs step-done';
        step2.className = 'step-item flex items-center gap-3 text-xs step-active';
      } else if (elapsed >= 4000) {
        step2.className = 'step-item flex items-center gap-3 text-xs step-done';
        step3.className = 'step-item flex items-center gap-3 text-xs step-active';
      }
    }, 500);
  }

  function stopProgressAnimation() {
    clearInterval(progressInterval);
  }

  // Safe and robust Base64 / Data URL to Blob converter (No atob DOMException)
  async function dataToBlob(dataString, mimeType = 'application/octet-stream') {
    if (!dataString) return new Blob([], { type: mimeType });

    if (dataString.startsWith('data:')) {
      try {
        const res = await fetch(dataString);
        return await res.blob();
      } catch (fetchErr) {
        console.warn('Fetch fallback for data URI:', fetchErr);
        const parts = dataString.split(',');
        const contentType = (parts[0].match(/:(.*?);/) || [])[1] || mimeType;
        const b64 = (parts[1] || '').replace(/[\s\r\n]+/g, '');
        const byteCharacters = atob(b64);
        const byteArrays = [];
        for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
          const slice = byteCharacters.slice(offset, offset + 1024);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }
        return new Blob(byteArrays, { type: contentType });
      }
    } else {
      return new Blob([dataString], { type: mimeType });
    }
  }

  // Trigger Local File Download
  async function triggerDownload(filename, data, mimeType) {
    try {
      const blob = await dataToBlob(data, mimeType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`💾 "${filename}" 다운로드 완료!`);
    } catch (err) {
      console.error('Download failed:', err);
      showToast('❌ 다운로드 중 오류가 발생했습니다.');
    }
  }

  // Render Capture Result
  async function renderResult(result) {
    currentResult = result;
    setState('preview');

    // Update Meta
    previewFileName.textContent = result.filename;
    previewFileSize.textContent = formatBytes(result.sizeBytes);
    previewDuration.textContent = `${result.durationSeconds || '0.0'}s 소요`;
    previewDimension.textContent = result.dimensions
      ? `${result.dimensions.width} × ${result.dimensions.height}px`
      : result.format.toUpperCase();

    // Clean previous blob URL if any
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }

    // Toggle format viewers
    pngViewer.classList.add('hidden');
    pdfViewer.classList.add('hidden');
    htmlViewer.classList.add('hidden');

    if (result.format === 'png') {
      pngViewer.classList.remove('hidden');
      previewImage.src = result.data;
      modalPreviewImage.src = result.data;
    } else if (result.format === 'pdf') {
      pdfViewer.classList.remove('hidden');
      try {
        const blob = await dataToBlob(result.data, result.mimeType || 'application/pdf');
        currentBlobUrl = URL.createObjectURL(blob);
        pdfDownloadLink.href = currentBlobUrl;
        pdfDownloadLink.download = result.filename;
      } catch (e) {
        console.error('PDF Blob URL creation error:', e);
      }
    } else if (result.format === 'html') {
      htmlViewer.classList.remove('hidden');
      previewHtmlCode.textContent = result.data.substring(0, 15000) + (result.data.length > 15000 ? '\n\n... [이하 생략 - 로컬 다운로드 시 전체 DOM 포함]' : '');
      const lines = result.data.split('\n').length;
      htmlLinesCount.textContent = `${lines.toLocaleString()} lines`;
    }

    // Save to history
    saveToHistory(result);
    renderHistory();
    lucide.createIcons();
  }

  // History management
  function saveToHistory(item) {
    // Keep top 6 items
    const record = {
      filename: item.filename,
      format: item.format,
      sizeBytes: item.sizeBytes,
      title: item.title,
      time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      data: item.data,
      mimeType: item.mimeType,
      durationSeconds: item.durationSeconds,
      dimensions: item.dimensions,
    };
    captureHistory = [record, ...captureHistory.filter((h) => h.filename !== item.filename)].slice(0, 6);
    try {
      localStorage.setItem('gofullpage_history', JSON.stringify(captureHistory));
    } catch (e) {
      console.warn('LocalStorage quota limit reached for history', e);
    }
  }

  function renderHistory() {
    if (!captureHistory || captureHistory.length === 0) {
      historyList.innerHTML = `<span class="text-slate-400 text-xs py-1">내역이 없습니다.</span>`;
      return;
    }

    historyList.innerHTML = captureHistory
      .map(
        (item, index) => `
        <button data-index="${index}" class="history-item px-2.5 py-1 bg-slate-100 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 border border-slate-200 rounded-md text-slate-700 text-[11px] font-medium flex items-center gap-1.5 shrink-0 transition">
          <span class="uppercase font-bold text-[9px] px-1 py-0.2 bg-white rounded border border-slate-200">${item.format}</span>
          <span class="max-w-[120px] truncate">${item.filename}</span>
        </button>
      `
      )
      .join('');

    // Attach click events
    document.querySelectorAll('.history-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index, 10);
        const item = captureHistory[idx];
        if (item) {
          await renderResult(item);
          showToast(`📋 이전 캡처 "${item.filename}" 불러옴`);
        }
      });
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    captureHistory = [];
    localStorage.removeItem('gofullpage_history');
    renderHistory();
    showToast('내역이 삭제되었습니다.');
  });

  // Main Capture Execution
  async function performCapture() {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      alert('URL을 입력해주세요.');
      urlInput.focus();
      return;
    }

    const format = formatSelect.value;
    const viewportVal = viewportSelect.value.split('x');
    const viewportWidth = parseInt(viewportVal[0], 10);
    const viewportHeight = parseInt(viewportVal[1], 10);
    const deviceScaleFactor = parseFloat(viewportVal[2]);

    setState('loading');
    startProgressAnimation();

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: rawUrl,
          format,
          viewportWidth,
          viewportHeight,
          deviceScaleFactor,
          delayMs: 600,
        }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || '캡처 처리 중 오류가 발생했습니다.');
      }

      stopProgressAnimation();
      await renderResult(json);
      showToast('🎉 전체 페이지 캡처가 완료되었습니다!');
    } catch (err) {
      stopProgressAnimation();
      setState('error');
      errorMessage.textContent = err.message || '웹페이지를 캡처하는 중 문제가 발생했습니다.';
      console.error('Capture request error:', err);
    }
  }

  // Event Listeners
  captureBtn.addEventListener('click', performCapture);
  retryBtn.addEventListener('click', performCapture);

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performCapture();
    }
  });

  // Download Trigger
  const handleDownload = async () => {
    if (!currentResult) return;
    await triggerDownload(currentResult.filename, currentResult.data, currentResult.mimeType);
  };
  downloadBtn.addEventListener('click', handleDownload);
  directSaveBtn.addEventListener('click', handleDownload);

  // Copy to Clipboard
  copyContentBtn.addEventListener('click', async () => {
    if (!currentResult) return;
    try {
      if (currentResult.format === 'html') {
        await navigator.clipboard.writeText(currentResult.data);
        showToast('📋 HTML DOM 소스가 클립보드에 복사되었습니다.');
      } else if (currentResult.format === 'png') {
        const blob = await dataToBlob(currentResult.data, currentResult.mimeType);
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        showToast('📋 스크린샷 이미지가 클립보드에 복사되었습니다.');
      } else {
        await navigator.clipboard.writeText(currentResult.filename);
        showToast('📋 파일명이 클립보드에 복사되었습니다.');
      }
    } catch (e) {
      console.warn('Clipboard copy failed:', e);
      showToast('다운로드 버튼을 통해 저장해주세요.');
    }
  });

  // Fullscreen Modal
  fullscreenModalBtn.addEventListener('click', () => {
    if (currentResult && currentResult.format === 'png') {
      fullscreenModal.classList.remove('hidden');
    }
  });

  closeModalBtn.addEventListener('click', () => {
    fullscreenModal.classList.add('hidden');
  });

  fullscreenModal.addEventListener('click', (e) => {
    if (e.target === fullscreenModal) {
      fullscreenModal.classList.add('hidden');
    }
  });

  // Initial setup
  renderHistory();
  if (urlInput.value) {
    clearUrlBtn.classList.remove('hidden');
    updateLiveFrame(urlInput.value);
  }
});
