let audioContext = null;
let masterGain = null;
let audioUnlocked = false;

function getAudioContext() {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;

        audioContext = new AudioContextClass();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.12;
        masterGain.connect(audioContext.destination);
    }

    return audioContext;
}

async function unlockAudio() {
    const context = getAudioContext();
    if (!context) return;

    try {
        if (context.state === "suspended") {
            await context.resume();
        }
        audioUnlocked = context.state === "running";
    } catch {
        // Les navigateurs peuvent refuser l'activation automatique du son.
    }
}

if (typeof window !== "undefined") {
    const unlock = () => {
        unlockAudio();
        window.removeEventListener("pointerdown", unlock);
        window.removeEventListener("keydown", unlock);
        window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
}

function tone(frequency, duration, startTime, type = "sine", volume = 0.22, endFrequency = null) {
    const context = getAudioContext();
    if (!context || !masterGain || !audioUnlocked) return;

    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);

    if (endFrequency !== null) {
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(20, endFrequency),
            startTime + duration
        );
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gain);
    gain.connect(masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
}

function noise(duration, startTime, volume = 0.08, filterFrequency = 1800) {
    const context = getAudioContext();
    if (!context || !masterGain || !audioUnlocked) return;

    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    filter.type = "lowpass";
    filter.frequency.value = filterFrequency;

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    source.start(startTime);
    source.stop(startTime + duration);
}

function playSequence(sequence) {
    const context = getAudioContext();
    if (!context || !audioUnlocked) return;

    const start = context.currentTime + 0.005;

    for (const item of sequence) {
        tone(
            item.frequency,
            item.duration,
            start + item.delay,
            item.type,
            item.volume,
            item.endFrequency
        );
    }
}

export const sfx = {
    // Validation : accord bref et lumineux.
    activityValidated() {
        playSequence([
            { frequency: 523.25, duration: 0.13, delay: 0, type: "sine", volume: 0.24 },
            { frequency: 659.25, duration: 0.15, delay: 0.09, type: "sine", volume: 0.23 },
            { frequency: 783.99, duration: 0.24, delay: 0.20, type: "sine", volume: 0.25 }
        ]);
    },

    // Proposition : petit son de confirmation, plus doux.
    activityProposed() {
        playSequence([
            { frequency: 392, duration: 0.09, delay: 0, type: "triangle", volume: 0.18 },
            { frequency: 523.25, duration: 0.14, delay: 0.07, type: "triangle", volume: 0.20 }
        ]);
    },

    // Modification : double clic musical.
    activityModified() {
        playSequence([
            { frequency: 440, duration: 0.09, delay: 0, type: "sine", volume: 0.18 },
            { frequency: 554.37, duration: 0.13, delay: 0.08, type: "sine", volume: 0.20 }
        ]);
    },

    // Suppression : descente courte et mate.
    activityDeleted() {
        playSequence([
            { frequency: 330, duration: 0.12, delay: 0, type: "triangle", volume: 0.18, endFrequency: 240 },
            { frequency: 220, duration: 0.18, delay: 0.10, type: "sine", volume: 0.15, endFrequency: 150 }
        ]);
        const context = getAudioContext();
        if (context && audioUnlocked) noise(0.08, context.currentTime + 0.02, 0.035, 700);
    },

    // Notification : petite cloche reconnaissable.
    notification() {
        playSequence([
            { frequency: 880, duration: 0.16, delay: 0, type: "sine", volume: 0.18 },
            { frequency: 1174.66, duration: 0.24, delay: 0.12, type: "sine", volume: 0.16 }
        ]);
    },

    // Demande d'ami : deux notes chaleureuses.
    friendRequest() {
        playSequence([
            { frequency: 659.25, duration: 0.13, delay: 0, type: "triangle", volume: 0.19 },
            { frequency: 783.99, duration: 0.18, delay: 0.10, type: "triangle", volume: 0.21 }
        ]);
    },

    // Participation à un jeu préparé : son énergique.
    joinGame() {
        playSequence([
            { frequency: 392, duration: 0.08, delay: 0, type: "triangle", volume: 0.17 },
            { frequency: 523.25, duration: 0.08, delay: 0.06, type: "triangle", volume: 0.18 },
            { frequency: 659.25, duration: 0.15, delay: 0.12, type: "triangle", volume: 0.21 }
        ]);
    },

    // Participation à une activité libre : son plus léger.
    joinActivity() {
        playSequence([
            { frequency: 466.16, duration: 0.10, delay: 0, type: "sine", volume: 0.16 },
            { frequency: 587.33, duration: 0.17, delay: 0.09, type: "sine", volume: 0.19 }
        ]);
    },

    // Jeux divers : petit "ding" de présence.
    joinMisc() {
        playSequence([
            { frequency: 587.33, duration: 0.10, delay: 0, type: "sine", volume: 0.17 },
            { frequency: 880, duration: 0.20, delay: 0.09, type: "sine", volume: 0.18 }
        ]);
    },

    leaveGame() {
        playSequence([
            { frequency: 659.25, duration: 0.10, delay: 0, type: "triangle", volume: 0.17 },
            { frequency: 440, duration: 0.17, delay: 0.09, type: "triangle", volume: 0.17 }
        ]);
    },

    leaveActivity() {
        playSequence([
            { frequency: 587.33, duration: 0.10, delay: 0, type: "sine", volume: 0.15 },
            { frequency: 392, duration: 0.18, delay: 0.09, type: "sine", volume: 0.16 }
        ]);
    },

    leaveMisc() {
        playSequence([
            { frequency: 880, duration: 0.09, delay: 0, type: "sine", volume: 0.14 },
            { frequency: 587.33, duration: 0.18, delay: 0.08, type: "sine", volume: 0.15 }
        ]);
    }
};
