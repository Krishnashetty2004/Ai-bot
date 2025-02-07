// Initialize DOM elements
const messageInput = document.querySelector(".message-input");
const chatContainer = document.querySelector(".chat-container");
const sendButton = document.querySelector(".send-button");
const chatMessages = document.querySelector(".chat-messages");
const fileInput = document.querySelector("#file-input");
const attachmentButton = document.querySelector(".attachment-button");

// Add your Gemini API key here
const GEMINI_API_KEY = 'AIzaSyBGkMzzlozv7D7XRN6NmaayKPaIKdPqykQ';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

// Store conversation history
let conversationHistory = [];
const MAX_HISTORY = 10;

// Store selected files
let selectedFiles = [];

// Function to save messages to local storage
function saveMessageToHistory(message, isUser = true) {
    const messageObj = {
        content: message,
        timestamp: new Date().toISOString(),
        isUser: isUser
    };
    conversationHistory.push(messageObj);
    if (conversationHistory.length > MAX_HISTORY) {
        conversationHistory.shift();
    }
    localStorage.setItem('chatHistory', JSON.stringify(conversationHistory));
}

// Load chat history from local storage
function loadChatHistory() {
    const history = localStorage.getItem('chatHistory');
    if (history) {
        conversationHistory = JSON.parse(history);
        conversationHistory.forEach(msg => {
            displayMessage(msg.content, msg.isUser);
        });
    }
}

// Function to display message in chat
function displayMessage(message, isUser = true) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const content = isUser ? 
        `<div class="message-content">${message}</div>` :
        `<div class="message-avatar">
            <i class="fa-solid fa-robot"></i>
         </div>
         <div class="message-content"><p>${message}</p></div>`;
    
    messageDiv.innerHTML = content;
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Function to get response from Gemini API with retry mechanism
async function getGeminiResponse(userMessage, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second

    try {
        const context = conversationHistory
            .slice(-3)
            .map(msg => msg.content)
            .join('\n');

        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Previous context:\n${context}\n\nCurrent message: ${userMessage}`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                },
                safetySettings: [
                    {
                        category: "HARM_CATEGORY_HARASSMENT",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    },
                    {
                        category: "HARM_CATEGORY_HATE_SPEECH",
                        threshold: "BLOCK_MEDIUM_AND_ABOVE"
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected API response structure');
        }
    } catch (error) {
        console.error('Error details:', error);
        
        if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return getGeminiResponse(userMessage, retryCount + 1);
        }
        
        return "I apologize, but I'm having trouble processing your request. Please try again.";
    }
}

// Function to get file icon based on type
function getFileIcon(fileType) {
    if (fileType.startsWith('image/')) return 'fa-image image';
    if (fileType.includes('pdf')) return 'fa-file-pdf pdf';
    if (fileType.includes('document') || fileType.includes('text/')) return 'fa-file-alt document';
    return 'fa-file other';
}

// Function to handle file selection
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert(`File ${file.name} is too large. Please select files under 5MB.`);
            return;
        }
        selectedFiles.push(file);
        displayFilePreview(file);
    });
    fileInput.value = ''; // Reset file input
}

// Function to display file preview
function displayFilePreview(file) {
    const container = document.querySelector('.attachments-container') || createAttachmentsContainer();
    const preview = document.createElement('div');
    preview.className = 'attachment-preview';
    preview.innerHTML = `
        <i class="fa-solid ${getFileIcon(file.type)} file-icon"></i>
        <span class="file-name">${file.name}</span>
        <i class="fa-solid fa-times remove-file"></i>
    `;
    
    preview.querySelector('.remove-file').onclick = () => {
        selectedFiles = selectedFiles.filter(f => f !== file);
        preview.remove();
        if (selectedFiles.length === 0) {
            container.remove();
        }
    };
    
    container.appendChild(preview);
}

// Function to create attachments container
function createAttachmentsContainer() {
    const container = document.createElement('div');
    container.className = 'attachments-container';
    chatContainer.insertBefore(container, document.querySelector('.chat-input'));
    return container;
}

// Function to handle file sharing in chat
async function shareFiles() {
    if (selectedFiles.length === 0) return;

    const fileMessages = [];
    for (const file of selectedFiles) {
        if (file.type.startsWith('image/')) {
            try {
                const base64 = await readFileAsBase64(file);
                fileMessages.push(`<img src="${base64}" alt="${file.name}" style="max-width: 200px; border-radius: 8px;">`);
            } catch (error) {
                console.error('Error reading image:', error);
                fileMessages.push(`<i class="fa-solid ${getFileIcon(file.type)} file-icon"></i> ${file.name}`);
            }
        } else {
            fileMessages.push(`<i class="fa-solid ${getFileIcon(file.type)} file-icon"></i> ${file.name}`);
        }
    }

    // Display files in chat
    displayMessage(fileMessages.join('<br>'), true);
    
    // Clear attachments
    selectedFiles = [];
    const container = document.querySelector('.attachments-container');
    if (container) container.remove();
}

// Function to read file as base64
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Update message handling to include files
async function handleOutgoingMessage(message) {
    if (!message.trim() && selectedFiles.length === 0) return;
    
    messageInput.disabled = true;
    sendButton.disabled = true;
    
    try {
        if (message.trim()) {
            displayMessage(message, true);
            saveMessageToHistory(message, true);
        }
        
        if (selectedFiles.length > 0) {
            await shareFiles();
        }
        
        // Show typing indicator
        const botTypingDiv = document.createElement("div");
        botTypingDiv.className = "message bot-message typing-indicator";
        botTypingDiv.innerHTML = `
            <div class="message-avatar">
                <i class="fa-solid fa-robot"></i>
            </div>
            <div class="message-content typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        chatMessages.appendChild(botTypingDiv);
        
        // Get and display bot response
        const botResponse = await getGeminiResponse(message);
        botTypingDiv.remove();
        displayMessage(botResponse, false);
        saveMessageToHistory(botResponse, false);
        
    } catch (error) {
        console.error('Error in message handling:', error);
        displayMessage("I apologize, but something went wrong. Please try again.", false);
    } finally {
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

// Add file input event listeners
fileInput.addEventListener('change', handleFileSelect);
attachmentButton.addEventListener('click', () => fileInput.click());

// Update send button click handler
sendButton.addEventListener("click", () => {
    if (!messageInput.disabled) {
        const message = messageInput.value.trim();
        handleOutgoingMessage(message);
        messageInput.value = "";
    }
});

// Update initialization message
function clearChatHistory() {
    localStorage.removeItem('chatHistory');
    conversationHistory = [];
    chatMessages.innerHTML = '';
    displayMessage("Hello, I'm TARS! How can I assist you today? 👋", false);
}

// Clear chat history on page load/refresh
window.onload = function() {
    // Clear local storage
    localStorage.removeItem('chatHistory');
    conversationHistory = [];
    chatMessages.innerHTML = '';
    
    // Add initial greeting
    displayMessage("Hello, I'm TARS 👋\nHow can I assist you today?", false);
    messageInput.focus();
};

// Enhanced emoji picker
const emojiButton = document.querySelector(".emoji-button");
const emojis = ["😊", "👋", "👍", "❤️", "😂", "🤔", "👏", "🎉", "🌟", "💡"];
let currentEmojiIndex = 0;

emojiButton.addEventListener("click", () => {
    messageInput.value += emojis[currentEmojiIndex];
    currentEmojiIndex = (currentEmojiIndex + 1) % emojis.length;
    messageInput.focus();
});

// Handle expand button click with smooth animation
const expandButton = document.querySelector(".expand-button");
expandButton.addEventListener("click", () => {
    chatContainer.classList.toggle("expanded");
    expandButton.textContent = chatContainer.classList.contains("expanded") ? "▲" : "▼";
    chatContainer.style.transition = "all 0.3s ease";
});

// Smooth scroll to bottom
function scrollToBottom() {
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
}

// Handle message input focus with visual feedback
messageInput.addEventListener("focus", () => {
    chatContainer.classList.add("input-focused");
});

messageInput.addEventListener("blur", () => {
    chatContainer.classList.remove("input-focused");
});

// Add Enter key press handler
messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !messageInput.disabled) {
        e.preventDefault();
        const message = messageInput.value.trim();
        if (message) {
            handleOutgoingMessage(message);
            messageInput.value = "";
        }
    }
});
