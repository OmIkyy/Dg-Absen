let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playClick() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Very quick responsive mechanical click sound
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.03);
    
    gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  } catch (err) {
    console.log("Audio feedback playClick play restricted or skipped:", err);
  }
}

export function playSuccessIn() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // Ascending melody chime for Clock In (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const noteDuration = 0.15;
    
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + noteDuration);
    });
  } catch (err) {
    console.log("Audio playSuccessIn skipped:", err);
  }
}

export function playSuccessOut() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // Descending melody chime for Clock Out (C6 -> G5 -> E5 -> C5)
    const notes = [1046.50, 783.99, 659.25, 523.25];
    const noteDuration = 0.18;
    
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.1, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + noteDuration);
    });
  } catch (err) {
    console.log("Audio playSuccessOut skipped:", err);
  }
}

export function playIzin() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    // Softer double-beep for Leave/Izin (F5 -> A5)
    const notes = [698.46, 880.00];
    const noteDuration = 0.22;
    
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.1;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + noteDuration);
    });
  } catch (err) {
    console.log("Audio playIzin skipped:", err);
  }
}

export function playError() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    // Fast high-priority low alert double-buzzer sound
    const notes = [150, 150];
    const noteDuration = 0.15;
    
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.12, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + noteDuration);
    });
  } catch (err) {
    console.log("Audio playError skipped:", err);
  }
}

export function playNotificationSound() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    const now = ctx.currentTime;
    
    // An elegant, crisp dual-tone high-frequency chime sound (E5 -> A5 -> E6)
    const notes = [659.25, 880.00, 1318.51];
    const noteDuration = 0.35;
    
    notes.forEach((freq, idx) => {
      const time = now + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, time + noteDuration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + noteDuration);
    });
  } catch (err) {
    console.log("Audio playNotificationSound skipped:", err);
  }
}

// Automatically bind click listener to all buttons, links, custom clickable elements across the app
export function initGlobalClickSound() {
  if (typeof window === 'undefined') return () => {};
  
  const handleGlobalClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    
    let isClickable = false;
    let current: HTMLElement | null = target;
    
    while (current && current !== document.body) {
      const tag = current.tagName;
      if (
        tag === 'BUTTON' || 
        tag === 'A' || 
        tag === 'INPUT' || 
        tag === 'SELECT' || 
        tag === 'TEXTAREA' || 
        current.classList.contains('cursor-pointer') ||
        current.getAttribute('role') === 'button'
      ) {
        isClickable = true;
        break;
      }
      current = current.parentElement;
    }
    
    if (isClickable) {
      playClick();
    }
  };
  
  document.addEventListener('click', handleGlobalClick, { capture: true });
  return () => {
    document.removeEventListener('click', handleGlobalClick, { capture: true });
  };
}
