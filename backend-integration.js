// Backend Integration for Clinical Session Recorder
// Handles chunked uploads, progress tracking, and backend transcription

const BACKEND_URL = 'https://b84f4a19-115a-4b65-add0-35bce5bed75e-00-3sf8cawfn6hzh.pike.replit.dev/api/transcription';

// Override the original transcribeRecording function with backend version
const originalTranscribeRecording = window.transcribeRecording;

window.transcribeRecording = async function() {
    if (!window.currentAudioBlob || !currentClientName) {
        showError('לא זמין אודיו או שם מטופל');
        return;
    }

    const transcribeBtn = document.getElementById('transcribeBtn');
    transcribeBtn.disabled = true;
    transcribeBtn.innerHTML = '<span class="processing-spinner"></span> מעבד...';
    showError('');

    try {
        const sessionId = Date.now().toString();
        const audioBlob = window.currentAudioBlob;
        const chunkSize = 1024 * 1024; // 1MB chunks
        const totalChunks = Math.ceil(audioBlob.size / chunkSize);

        // Create progress container
        const progressContainer = document.createElement('div');
        progressContainer.id = 'transcribeProgress';
        progressContainer.style.cssText = `
            margin: 1rem 0;
            padding: 1.5rem;
            background: white;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        `;
        transcribeBtn.parentElement.insertBefore(progressContainer, transcribeBtn.nextSibling);

        // Upload chunks with progress
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, audioBlob.size);
            const chunk = audioBlob.slice(start, end);

            const formData = new FormData();
            formData.append('sessionId', sessionId);
            formData.append('chunkIndex', i);
            formData.append('totalChunks', totalChunks);
            formData.append('audioChunk', chunk);

            const uploadResponse = await fetch(`${BACKEND_URL}/chunk`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error(`העלאה נכשלה: ${uploadResponse.statusText}`);
            }

            // Calculate and display progress
            const uploadPercent = Math.round(((i + 1) / totalChunks) * 100);
            updateProgressBar(progressContainer, uploadPercent, 'העלאה');
        }

        // Transcription phase
        updateProgressBar(progressContainer, 100, 'התמללול בעיצומו');

        const transcribeResponse = await fetch(`${BACKEND_URL}/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                mimeType: 'audio/webm'
            })
        });

        if (!transcribeResponse.ok) {
            throw new Error(`התמללול נכשל: ${transcribeResponse.statusText}`);
        }

        const result = await transcribeResponse.json();
        const transcript = result.transcript || '';

        // Extract highlights from transcript
        const highlights = extractHighlightsFromTranscript(transcript);

        // Save session with metadata
        const session = {
            id: Date.now(),
            clientName: currentClientName,
            date: new Date().toLocaleString(),
            transcript: transcript,
            highlights: highlights,
            status: 'complete',
            duration: calculateDuration(audioBlob.size),
            fileSize: Math.round(audioBlob.size / 1024) // KB
        };

        saveSession(session);

        // Success notification
        showSuccess('הפגישה הותמללה והישמרה בהצלחה!');
        
        // Clean up
        document.getElementById('audioPlayback').classList.remove('active');
        document.getElementById('clientName').value = '';
        currentClientName = '';
        window.currentAudioBlob = null;
        progressContainer.remove();
        document.getElementById('clientName').focus();
        loadSessions();

    } catch (err) {
        showError(`התמללול נכשל: ${err.message}`);
        const progressContainer = document.getElementById('transcribeProgress');
        if (progressContainer) progressContainer.remove();
    } finally {
        transcribeBtn.disabled = false;
        transcribeBtn.innerHTML = 'העתק וצור הדגשות';
    }
};

// Helper function to update progress bar
function updateProgressBar(container, percent, phase) {
    container.innerHTML = `
        <div style="margin-bottom: 0.75rem;">
            <div style="font-size: 0.9rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.5rem;">
                ${phase}: ${percent}%
            </div>
            <div style="width: 100%; height: 10px; background: #e5e5e5; border-radius: 5px; overflow: hidden;">
                <div style="
                    width: ${percent}%; 
                    height: 100%; 
                    background: linear-gradient(90deg, #1a1a1a, #333);
                    transition: width 0.3s ease;
                    border-radius: 5px;
                "></div>
            </div>
        </div>
        <div style="font-size: 0.8rem; color: #999; margin-top: 0.5rem;">
            אנא המתן... זה עשוי להימשך כמה דקות
        </div>
    `;
}

// Helper function to extract highlights from transcript
function extractHighlightsFromTranscript(transcript) {
    if (!transcript) return [];

    // Split by therapist/client markers
    const lines = transcript.split(/(\*\*Therapist:\*\*|\*\*Client:\*\*)/);
    
    // Extract key sentences (longer ones with substance)
    const highlights = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Look for substantive client statements
        if (lines[i - 1] === '**Client:**' && line.length > 50) {
            highlights.push(line.substring(0, 150));
        }
    }

    // If we didn't find enough, use sentence-based extraction
    if (highlights.length < 3) {
        const sentences = transcript
            .split(/[.!?]+/)
            .filter(s => s.trim().length > 40)
            .slice(0, 5)
            .map(s => s.trim());
        return sentences;
    }

    return highlights.slice(0, 5);
}

// Helper function to calculate duration estimate
function calculateDuration(fileSizeBytes) {
    // Rough estimate: audio at 128kbps = ~16KB per second
    const estimatedSeconds = Math.round(fileSizeBytes / 16000);
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Also override transcribeSummary for consistency
const originalTranscribeSummary = window.transcribeSummary;

window.transcribeSummary = async function(clientId, audioBlob) {
    const statusDiv = document.getElementById(`summaryStatus-${clientId}`);
    statusDiv.innerHTML = '<div class="processing-spinner"></div> מעבד סיכום...';

    try {
        const sessionId = `summary-${clientId}-${Date.now()}`;
        const chunkSize = 1024 * 1024;
        const totalChunks = Math.ceil(audioBlob.size / chunkSize);

        // Upload chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, audioBlob.size);
            const chunk = audioBlob.slice(start, end);

            const formData = new FormData();
            formData.append('sessionId', sessionId);
            formData.append('chunkIndex', i);
            formData.append('totalChunks', totalChunks);
            formData.append('audioChunk', chunk);

            await fetch(`${BACKEND_URL}/chunk`, {
                method: 'POST',
                body: formData
            });
        }

        // Transcribe
        const transcribeResponse = await fetch(`${BACKEND_URL}/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                mimeType: 'audio/webm'
            })
        });

        if (!transcribeResponse.ok) {
            throw new Error('התמללול נכשל');
        }

        const result = await transcribeResponse.json();
        const summaryText = result.transcript || '';

        // Save summary
        const clients = JSON.parse(localStorage.getItem(CLIENTS_KEY) || '[]');
        const client = clients.find(c => c.id === clientId);
        if (client) {
            if (!client.therapistSummaries) {
                client.therapistSummaries = [];
            }
            client.therapistSummaries.push({
                date: new Date().toLocaleString(),
                text: summaryText
            });
            localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
            loadClients();
            statusDiv.innerHTML = '<span style="color: #388e3c; font-weight: 600;">✓ סיכום נשמר בהצלחה</span>';
        }
    } catch (err) {
        statusDiv.innerHTML = `<span style="color: #d32f2f;">שגיאה: ${err.message}</span>`;
    }
};

console.log('Backend integration loaded successfully. Using Replit backend for transcription.');
