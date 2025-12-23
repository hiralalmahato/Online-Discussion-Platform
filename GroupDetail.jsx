import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { createThread, likeThread, deleteThread } from '../store/slices/threadSlice';
import { io } from 'socket.io-client';
import api, { SERVER_URL } from '../services/api';
import { MessageSquare, FileText, Users, Send, ThumbsUp, Trash2, Paperclip, MapPin, Reply as ReplyIcon, X } from 'lucide-react';
import FilePreviewModal from '../components/FilePreviewModal';

const GroupDetail = () => {
    const { id } = useParams();
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { user } = useSelector((state) => state.auth);

    const [group, setGroup] = useState(null);
    const [threads, setThreads] = useState([]);
    const [activeTab, setActiveTab] = useState('threads');

    const [messages, setMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [files, setFiles] = useState([]);
    const [replyTo, setReplyTo] = useState(null);
    const socketRef = useRef();
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const prevMessageCountRef = useRef(0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {

        if (messages.length > prevMessageCountRef.current) {
            scrollToBottom();
        }
        prevMessageCountRef.current = messages.length;
    }, [messages]);

    const [showThreadModal, setShowThreadModal] = useState(false);
    const [threadData, setThreadData] = useState({ title: '', body: '' });

    const [notes, setNotes] = useState([]);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [noteData, setNoteData] = useState({ title: '', content: '' });
    const noteRepliesEndRef = useRef(null);
    const selectedNoteRef = useRef(null);

    const [inviteLink, setInviteLink] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [pendingInvites, setPendingInvites] = useState([]);

    // File Preview State
    const [previewFile, setPreviewFile] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

    const openPreview = (file) => {
        setPreviewFile({
            url: `${SERVER_URL}/uploads/${file.path.split(/[\\/]/).pop()}`,
            name: file.name,
            type: file.mimetype
        });
        setShowPreviewModal(true);
    };

    const fetchThreads = async () => {
        try {
            const threadsRes = await api.get(`/groups/${id}/threads`);
            setThreads(threadsRes.data);
        } catch (err) {
        }
    };

    useEffect(() => {
        const fetchGroupData = async () => {
            try {
                const res = await api.get(`/groups/${id}`);
                setGroup(res.data);

                const chatRes = await api.get(`/chat/${id}`);
                setMessages(chatRes.data);

                const notesRes = await api.get(`/groups/${id}/notes`);
                setNotes(notesRes.data);

                await fetchThreads();

            } catch (err) {
            }
        };

        fetchGroupData();

        socketRef.current = io(SERVER_URL);
        socketRef.current.emit('join_group', id);

        socketRef.current.on('receive_message', (message) => {
            setMessages((prev) => [...prev, message]);
        });

        socketRef.current.on('update_message', (updatedMsg) => {
            setMessages((prev) => prev.map(msg => msg._id === updatedMsg._id ? { ...msg, ...updatedMsg } : msg));
        });

        socketRef.current.on('thread_updated', () => {
            fetchThreads();
        });

        socketRef.current.on('new_thread', (newThread) => {
            setThreads(prev => [newThread, ...prev]);
        });

        socketRef.current.on('thread_deleted', ({ threadId }) => {
            setThreads(prev => prev.filter(t => t._id !== threadId));
        });

        socketRef.current.on('note_created', () => {

            const fetchNotes = async () => {
                try {
                    const res = await api.get(`/groups/${id}/notes`);
                    setNotes(res.data);
                } catch (err) { }
            };
            fetchNotes();
        });

        socketRef.current.on('note_updated', ({ noteId }) => {
            const updateNotes = async () => {
                try {

                    const res = await api.get(`/groups/${id}/notes`);
                    setNotes(res.data);

                    if (selectedNoteRef.current && selectedNoteRef.current._id === noteId) {
                        const noteRes = await api.get(`/notes/${noteId}`);
                        setSelectedNote(noteRes.data);
                    }
                } catch (err) {
                }
            };
            updateNotes();
        });

        socketRef.current.on('note_deleted', ({ noteId }) => {
            setNotes(prev => prev.filter(n => n._id !== noteId));
            if (selectedNote && selectedNote._id === noteId) {
                setSelectedNote(null);
            }
        });

        return () => {
            socketRef.current.disconnect();
        };
    }, [id]);

    const handleFileChange = (e) => {
        setFiles([...e.target.files]);
    };

    const sendChat = async (e) => {
        e.preventDefault();
        if ((!chatInput.trim() && files.length === 0)) return;

        try {
            const formData = new FormData();
            formData.append('content', chatInput);
            if (replyTo) formData.append('replyTo', replyTo._id);

            files.forEach(file => {
                formData.append('files', file);
            });

            await api.post(`/chat/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setChatInput('');
            setFiles([]);
            setReplyTo(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err) {
            alert("Failed to send message");
        }
    };

    const handleLocationShare = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude, longitude } = position.coords;

            try {
                const formData = new FormData();
                formData.append('lat', latitude);
                formData.append('lng', longitude);

                await api.post(`/chat/${id}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            } catch (err) {
                console.error("Location share error:", err);
                alert("Failed to share location. Please try again.");
            }
        }, (error) => {
            console.error("Geolocation error:", error);
            let errorMessage = 'Unable to retrieve your location';
            if (error.code === 1 && error.message.includes('secure origin')) {
                errorMessage = "Location sharing requires HTTPS or localhost. For local testing on other devices, go to chrome://flags/#unsafely-treat-insecure-origin-as-secure and add your local IP.";
            } else if (error.message) {
                errorMessage += ': ' + error.message;
            }
            alert(errorMessage);
        });
    };

    const handleLikeMessage = (msgId) => {
        socketRef.current.emit('like_message', { messageId: msgId, userId: user._id });
    };

    const [selectedNote, setSelectedNote] = useState(null);
    const [noteReply, setNoteReply] = useState('');

    const handleDeleteNote = async (noteId) => {
        if (window.confirm("Delete this note?")) {
            try {

                await api.delete(`/notes/${noteId}`);
                setNotes(notes.filter(n => n._id !== noteId));
            } catch (err) {
            }
        }
    };

    const handleCreateNote = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('title', noteData.title);
        formData.append('content', noteData.content);
        if (noteData.files) {
            for (let i = 0; i < noteData.files.length; i++) {
                formData.append('files', noteData.files[i]);
            }
        }

        try {
            const res = await api.post(`/groups/${id}/notes`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setNotes([res.data, ...notes]);
            setShowNoteModal(false);
            setNoteData({ title: '', content: '' });
        } catch (err) {
            alert("Failed to create note");
        }
    };

    const handleLikeNote = async (noteId) => {
        try {
            const res = await api.put(`/notes/${noteId}/like`);

            setNotes(prev => prev.map(n => n._id === noteId ? { ...n, likes: res.data } : n));

            if (selectedNote && selectedNote._id === noteId) {
                setSelectedNote(prev => ({ ...prev, likes: res.data }));
            }
        } catch (err) { }
    };

    const handleReplyNote = async (e) => {
        e.preventDefault();
        if (!noteReply.trim()) return;
        try {
            const res = await api.post(`/notes/${selectedNote._id}/replies`, { body: noteReply });

            const newReply = res.data;

            const updatedReplies = selectedNote.replies ? [...selectedNote.replies, newReply] : [newReply];
            setSelectedNote({ ...selectedNote, replies: updatedReplies, replyCount: (selectedNote.replyCount || 0) + 1 });
            setNoteReply('');

            setNotes(prev => prev.map(n => n._id === selectedNote._id ? { ...n, replyCount: (n.replyCount || 0) + 1 } : n));

        } catch (err) { }
    };

    useEffect(() => {
        if (selectedNote && !selectedNote.replies) {

            api.get(`/notes/${selectedNote._id}`)
                .then(res => {
                    setSelectedNote(res.data);
                    selectedNoteRef.current = res.data;
                })
                .catch(console.error);
        } else {
            selectedNoteRef.current = selectedNote;
        }
    }, [selectedNote?._id]);

    useEffect(() => {
        if (selectedNote?.replies && noteRepliesEndRef.current) {
            noteRepliesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedNote?.replies?.length]);

    const handleCreateThread = async (e) => {
        e.preventDefault();
        const res = await dispatch(createThread({ groupId: id, threadData }));
        if (res.meta.requestStatus === 'fulfilled') {
            setShowThreadModal(false);
            setThreadData({ title: '', body: '' });
            fetchThreads();
        }
    };

    const handleLikeThread = async (e, threadId) => {
        e.preventDefault();

        await dispatch(likeThread(threadId));

    };

    const handleDeleteThread = async (e, threadId) => {
        e.preventDefault();
        if (window.confirm("Are you sure you want to delete this discussion?")) {
            await dispatch(deleteThread(threadId));
        }
    };

    const generateInvite = async () => {
        try {
            const res = await api.post(`/groups/${id}/invite/generate`);
            setInviteLink(res.data.inviteLink);
            alert('New invite link generated!');
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to generate invite');
        }
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink);
        alert('Invite link copied to clipboard!');
    };

    const searchUsers = async (query) => {
        if (!query) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await api.get(`/users?search=${query}`);

            const filtered = res.data.filter(u => !group.members.some(m => m.user._id === u._id));
            const sorted = filtered.sort((a, b) => a.username.localeCompare(b.username));
            setSearchResults(sorted);
        } catch (err) {
        }
    };

    const inviteUser = async (userId) => {
        try {
            await api.post('/invites', { groupId: id, userId });
            alert('Invite sent!');
            setSearchQuery('');
            setSearchResults([]);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to send invite');
        }
    };

    if (!group) return <div className="p-8">Loading...</div>;

    const isMember = group.isMember !== false && group.members?.some(m => m.user._id === user?._id);
    const isCreator = user?._id === group.creator._id || user?._id === group.creator;

    if (!isMember && !isCreator) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-16 text-center">
                <h1 className="text-4xl font-bold mb-4">{group.name}</h1>
                <p className="text-xl text-gray-500 mb-8">{group.description}</p>
                <div className="mb-8 inline-block px-4 py-2 bg-indigo-100 text-indigo-800 rounded-full flex items-center gap-2 mx-auto"><span className="text-xl">🔒</span> Invite-Only Group</div>
                <p className="text-gray-600">You need an invite link to join this group</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-64px)] flex flex-col">
            <FilePreviewModal
                isOpen={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                fileUrl={previewFile?.url}
                fileName={previewFile?.name}
                fileType={previewFile?.type}
            />
            <div className="mb-6">
                <h1 className="text-3xl font-bold">{group.name}</h1>
                <p className="text-gray-500">{group.description}</p>
            </div>

            <div className="flex border-b border-gray-200 mb-4">
                <button onClick={() => setActiveTab('threads')} className={`px-4 py-2 font-medium ${activeTab === 'threads' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Threads</button>
                <button onClick={() => setActiveTab('chat')} className={`px-4 py-2 font-medium ${activeTab === 'chat' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Chat</button>
                <button onClick={() => setActiveTab('notes')} className={`px-4 py-2 font-medium ${activeTab === 'notes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Notes</button>
                <button onClick={() => setActiveTab('members')} className={`px-4 py-2 font-medium ${activeTab === 'members' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>Members</button>
            </div>

            <div className="flex-1 overflow-hidden relative">
                {activeTab === 'threads' && (
                    <div className="h-full overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">Discussions</h3>
                            <button onClick={() => setShowThreadModal(true)} className="bg-indigo-600 text-white px-3 py-1 rounded">New Thread</button>
                        </div>

                        <div className="space-y-4">
                            {threads.length === 0 ? (
                                <p className="text-gray-500 text-center py-8">No discussions yet. Start one!</p>
                            ) : (
                                threads.map((thread) => (
                                    <div
                                        key={thread._id}
                                        onClick={() => navigate(`/threads/${thread._id}`)}
                                        className="block bg-white p-4 rounded-lg border border-gray-200 hover:border-indigo-500 transition-colors cursor-pointer relative"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-lg font-bold text-gray-900">{thread.title}</h4>
                                                <p className="text-gray-600 line-clamp-2 mt-1">{thread.body}</p>
                                            </div>
                                            <div className="flex flex-col gap-3 items-end shrink-0 border-l border-gray-100 pl-4 ml-4">

                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleLikeThread(e, thread._id);
                                                    }}
                                                    className={`flex items-center gap-1.5 text-base px-3 py-1.5 rounded-lg border transition-all ${thread.likes && thread.likes.includes(user?._id) ? 'bg-indigo-50 border-indigo-200 text-indigo-600 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                                    title="Like Discussion"
                                                >
                                                    <ThumbsUp size={20} /> {thread.likes ? thread.likes.length : 0}
                                                </button>

                                                {user?._id && thread.author?._id && user._id.toString() === thread.author._id.toString() && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDeleteThread(e, thread._id);
                                                        }}
                                                        className="flex items-center justify-center p-2 text-gray-400 hover:text-white hover:bg-red-500 rounded-lg transition-colors"
                                                        title="Delete Discussion"
                                                    >
                                                        <Trash2 size={24} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center text-xs text-gray-400 mt-3 space-x-4">
                                            <span>By {thread.author.username}</span>
                                            <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                                            <span className="flex items-center gap-1"><MessageSquare size={14} /> {thread.replyCount || (thread.replies ? thread.replies.length : 0)} replies</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'chat' && (
                    <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.map((msg, idx) => {
                                const senderId = msg.sender?._id || msg.sender;
                                const isMe = user?._id && senderId && senderId.toString() === user._id.toString();
                                const senderName = msg.sender?.username || 'User';
                                const isDeleted = msg.isDeleted;
                                const deletedByName = msg.deletedBy?.username || 'someone';

                                return (
                                    <div
                                        key={idx}
                                        id={`message-${msg._id}`}
                                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                                    >
                                        <div className={`max-w-[70%] relative group`}>

                                            {!isDeleted && (
                                                <div className={`absolute top-0 ${isMe ? '-left-20' : '-right-20'} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white shadow-sm border rounded-lg p-1 z-10`}>
                                                    <button onClick={() => handleLikeMessage(msg._id)} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-indigo-600" title="Like">
                                                        <ThumbsUp size={14} />
                                                    </button>
                                                    <button onClick={() => { setReplyTo(msg); }} className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-blue-600" title="Reply">
                                                        <ReplyIcon size={14} />
                                                    </button>
                                                    {isMe && (
                                                        <button
                                                            onClick={() => {

                                                                socketRef.current.emit('delete_message', { messageId: msg._id, userId: user._id, userName: user.username });
                                                            }}
                                                            className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-red-500" title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {msg.replyTo && (
                                                <div
                                                    onClick={() => {
                                                        const targetOption = document.getElementById(`message-${msg.replyTo._id}`);
                                                        if (targetOption) {
                                                            targetOption.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                            targetOption.classList.add('bg-blue-50');
                                                            setTimeout(() => targetOption.classList.remove('bg-blue-50'), 2000);
                                                        } else {
                                                            alert('Original message not found');
                                                        }
                                                    }}
                                                    className={`text-xs p-2 mb-1 rounded opacity-70 border-l-2 cursor-pointer hover:opacity-100 transition-opacity ${isMe ? 'bg-indigo-700 border-indigo-300 text-indigo-100' : 'bg-gray-200 border-gray-400 text-gray-600'}`}
                                                >
                                                    <span className="font-bold">{msg.replyTo.sender?.username || 'User'}</span>: {msg.replyTo.content?.substring(0, 30) || '...'}
                                                </div>
                                            )}

                                            <div className={`px-4 py-2 rounded-lg ${isMe ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                                <p className="text-xs opacity-75 mb-1 font-bold">{senderName}</p>

                                                {!isDeleted && msg.files && msg.files.length > 0 && (
                                                    <div className="mb-2 space-y-2">
                                                        {msg.files.map((file, i) => (
                                                            <div key={i}>
                                                                {file.mimetype && file.mimetype.startsWith('image/') ? (
                                                                    <img
                                                                        src={`${SERVER_URL}/uploads/${file.path.split(/[\\/]/).pop()}`}
                                                                        alt="attachment"
                                                                        className="max-w-full h-auto rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                                                        onClick={() => openPreview(file)}
                                                                    />
                                                                ) : (
                                                                    <button
                                                                        onClick={() => openPreview(file)}
                                                                        className={`flex items-center gap-2 p-2 rounded ${isMe ? 'bg-indigo-500 hover:bg-indigo-400' : 'bg-gray-200 hover:bg-gray-300'} transition-colors w-full text-left`}
                                                                    >
                                                                        <FileText size={16} />
                                                                        <span className="text-sm underline truncate">{file.name}</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {!isDeleted && msg.location && msg.location.lat && (
                                                    <div className="mb-2 w-64 h-48 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-pointer">
                                                        <iframe
                                                            width="100%"
                                                            height="100%"
                                                            frameBorder="0"
                                                            src={`https://maps.google.com/maps?q=${msg.location.lat},${msg.location.lng}&z=15&output=embed`}
                                                            title="Location"
                                                            onClick={() => window.open(`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`, '_blank')}
                                                            style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                                        />
                                                        <div className="text-center py-1 bg-white border-t border-gray-200">
                                                            <a
                                                                href={`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`text-xs underline ${isMe ? 'text-indigo-200' : 'text-indigo-600'}`}
                                                            >
                                                                📍 Open in Google Maps
                                                            </a>
                                                        </div>
                                                    </div>
                                                )}

                                                {isDeleted ? (
                                                    <p className="italic text-sm opacity-80">🚫 This message was deleted by {deletedByName}</p>
                                                ) : (
                                                    msg.content && <p>{msg.content}</p>
                                                )}

                                                <div className={`flex items-center justify-end gap-2 mt-1 text-[10px] ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                                                    {msg.likes && msg.likes.length > 0 && (
                                                        <span className="flex items-center gap-0.5"><ThumbsUp size={10} /> {msg.likes.length}</span>
                                                    )}
                                                    <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {replyTo && (
                            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm text-gray-600">
                                <span>Replying to <b>{replyTo.sender?.username}</b></span>
                                <button onClick={() => setReplyTo(null)}><X size={16} /></button>
                            </div>
                        )}

                        {files.length > 0 && (
                            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 flex gap-2 overflow-x-auto">
                                {files.map((file, i) => (
                                    <div key={i} className="flex items-center gap-1 bg-white border px-2 py-1 rounded text-xs">
                                        <span className="truncate max-w-[100px]">{file.name}</span>
                                        <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-red-500 hover:bg-red-50 rounded"><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <form onSubmit={sendChat} className="p-4 border-t border-gray-100 flex gap-2 items-center">
                            <input
                                type="file"
                                multiple
                                hidden
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current.click()}
                                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                                title="Attach File"
                            >
                                <Paperclip size={20} />
                            </button>
                            <button
                                type="button"
                                onClick={handleLocationShare}
                                className="p-2 text-gray-500 hover:text-red-500 hover:bg-gray-100 rounded-full transition-colors"
                                title="Share Location"
                            >
                                <MapPin size={20} />
                            </button>
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 outline-none focus:border-indigo-500"
                                placeholder={files.length > 0 ? "Add a caption..." : "Type a message..."}
                            />
                            <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700">
                                <Send size={20} />
                            </button>
                        </form>
                    </div>
                )}
                {activeTab === 'notes' && (
                    <div className="h-full overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold">Shared Notes</h3>
                            <button onClick={() => setShowNoteModal(true)} className="bg-indigo-600 text-white px-3 py-1 rounded gap-2 flex items-center"><FileText size={16} /> New Note</button>
                        </div>
                        <div className="space-y-4">
                            {notes.map((note) => (
                                <div key={note._id} onClick={() => setSelectedNote(note)} className="bg-yellow-50 p-6 rounded-lg border border-yellow-200 relative group cursor-pointer hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-xl font-bold text-gray-900 mb-2">{note.title}</h4>
                                        <div className="flex items-center gap-4 text-gray-600">
                                            {note.files && note.files.length > 0 && (
                                                <span className="flex items-center gap-1.5 text-base font-medium"><FileText size={20} /> {note.files.length}</span>
                                            )}
                                            <span className="flex items-center gap-1.5 text-base font-medium"><ThumbsUp size={20} /> {note.likes ? note.likes.length : 0}</span>
                                            <span className="flex items-center gap-1.5 text-base font-medium"><MessageSquare size={20} /> {note.replyCount || 0}</span>
                                        </div>
                                    </div>
                                    <p className="text-gray-700 whitespace-pre-wrap line-clamp-2 mb-3 text-base">{note.content}</p>
                                    <div className="text-sm text-gray-500">
                                        <span>By {note.author.username}</span>
                                    </div>

                                    {user?._id === note.author._id && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteNote(note._id); }}
                                            className="absolute bottom-4 right-4 text-gray-400 hover:text-red-500 p-2"
                                            title="Delete Note"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showNoteModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-lg">
                            <h3 className="text-xl font-bold mb-4">Create Note</h3>
                            <form onSubmit={handleCreateNote} className="space-y-4">
                                <input type="text" placeholder="Title" required className="w-full border p-2 rounded" value={noteData.title} onChange={e => setNoteData({ ...noteData, title: e.target.value })} />
                                <textarea placeholder="Content" required className="w-full border p-2 rounded h-32" value={noteData.content} onChange={e => setNoteData({ ...noteData, content: e.target.value })} />
                                <input type="file" multiple onChange={e => setNoteData({ ...noteData, files: e.target.files })} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setShowNoteModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                {showThreadModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-lg w-full max-w-lg">
                            <h3 className="text-xl font-bold mb-4">Create Thread</h3>
                            <form onSubmit={handleCreateThread} className="space-y-4">
                                <input type="text" placeholder="Title" required className="w-full border p-2 rounded" value={threadData.title} onChange={e => setThreadData({ ...threadData, title: e.target.value })} />
                                <textarea placeholder="Body" required className="w-full border p-2 rounded h-32" value={threadData.body} onChange={e => setThreadData({ ...threadData, body: e.target.value })} />
                                <div className="flex justify-end gap-2">
                                    <button type="button" onClick={() => setShowThreadModal(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {selectedNote && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg w-full max-w-3xl h-[80vh] flex flex-col">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">{selectedNote.title}</h2>
                                    <div className="flex items-center text-sm text-gray-500 mt-1 gap-4">
                                        <span>By {selectedNote.author?.username}</span>
                                        <span>{new Date(selectedNote.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedNote(null)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">&times;</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6">
                                <p className="whitespace-pre-wrap text-gray-800 leading-relaxed mb-6">{selectedNote.content}</p>

                                {selectedNote.files && selectedNote.files.length > 0 && (
                                    <div className="mb-8">
                                        <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><FileText size={16} /> Attachments</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedNote.files.map((file, idx) => {
                                                const filename = file.path.split(/[\\/]/).pop();
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => openPreview(file)}
                                                        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm"
                                                    >
                                                        <FileText size={14} />
                                                        <span className="truncate max-w-[150px]">{file.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-gray-100 pt-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-bold">Comments</h3>
                                        <button
                                            onClick={() => handleLikeNote(selectedNote._id)}
                                            className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border ${selectedNote.likes && selectedNote.likes.includes(user?._id) ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            <ThumbsUp size={14} /> {selectedNote.likes ? selectedNote.likes.length : 0} Likes
                                        </button>
                                    </div>

                                    <div className="space-y-4 mb-6">
                                        {selectedNote.replies && selectedNote.replies.map((reply) => {
                                            const isMyReply = reply.author?._id === user?._id;
                                            const isLiked = reply.likes && reply.likes.includes(user?._id);
                                            return (
                                                <div key={reply._id} className="bg-gray-50 p-4 rounded-lg group">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-semibold text-sm">{reply.author?.username}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-400">{new Date(reply.createdAt).toLocaleDateString()}</span>

                                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={async () => {
                                                                        try {
                                                                            await api.put(`/notes/replies/${reply._id}/like`);

                                                                        } catch (err) { }
                                                                    }}
                                                                    className={`p-1 rounded hover:bg-gray-200 transition-colors ${isLiked ? 'text-indigo-600' : 'text-gray-400'}`}
                                                                    title="Like"
                                                                >
                                                                    <ThumbsUp size={14} />
                                                                </button>
                                                                {isMyReply && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            if (window.confirm('Delete this comment?')) {
                                                                                try {
                                                                                    await api.delete(`/notes/replies/${reply._id}`);

                                                                                } catch (err) { }
                                                                            }
                                                                        }}
                                                                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors"
                                                                        title="Delete"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="text-gray-700 text-sm">{reply.body}</p>
                                                    {reply.likes && reply.likes.length > 0 && (
                                                        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                                                            <ThumbsUp size={10} /> {reply.likes.length}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {(!selectedNote.replies || selectedNote.replies.length === 0) && (
                                            <p className="text-gray-400 italic text-sm">No comments yet.</p>
                                        )}
                                        <div ref={noteRepliesEndRef} />
                                    </div>

                                    <form onSubmit={handleReplyNote} className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Write a comment..."
                                            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 outline-none"
                                            value={noteReply}
                                            onChange={(e) => setNoteReply(e.target.value)}
                                        />
                                        <button type="submit" className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700">
                                            <Send size={18} />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'members' && (
                    <div className="h-full overflow-y-auto bg-white rounded-lg border border-gray-200">
                        <div className="p-4">
                            <h3 className="text-lg font-bold mb-4">Group Members</h3>
                            <div className="space-y-3">

                                {isCreator && (
                                    <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                                        <h4 className="font-bold text-indigo-800 mb-3">Invite Members</h4>

                                        <div className="mb-4">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Share Invite Link</label>
                                            <div className="flex gap-2">
                                                {inviteLink ? (
                                                    <>
                                                        <input
                                                            type="text"
                                                            value={inviteLink}
                                                            readOnly
                                                            className="flex-1 px-3 py-2 border rounded text-sm bg-white"
                                                        />
                                                        <button onClick={copyInviteLink} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Copy</button>
                                                    </>
                                                ) : (
                                                    <button onClick={generateInvite} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Generate Link</button>
                                                )}
                                                {inviteLink && (
                                                    <button onClick={generateInvite} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Regenerate</button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Invite User</label>
                                            <input
                                                type="text"
                                                placeholder="Search users..."
                                                value={searchQuery}
                                                onChange={(e) => {
                                                    setSearchQuery(e.target.value);
                                                    searchUsers(e.target.value);
                                                }}
                                                className="w-full px-3 py-2 border rounded text-sm"
                                            />
                                            {searchResults.length > 0 && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
                                                    {searchResults.map(u => (
                                                        <div
                                                            key={u._id}
                                                            onClick={() => inviteUser(u._id)}
                                                            className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between items-center"
                                                        >
                                                            <span>{u.username}</span>
                                                            <span className="text-xs text-indigo-600">Invite</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {group.members.map((member) => (
                                    <div key={member._id} className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                                {member.user.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 flex items-center gap-2">
                                                    {member.user.username}
                                                    {member.role === 'admin' && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">Group Owner</span>}
                                                </p>
                                                <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                                            </div>
                                        </div>
                                        {user._id !== member.user._id && (
                                            <button
                                                onClick={() => navigate(`/chat/private/${member.user._id}`)}
                                                className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 font-medium"
                                            >
                                                Message
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GroupDetail;
