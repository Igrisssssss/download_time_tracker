<?php

use App\Http\Controllers\Api\ChatController;
use Illuminate\Support\Facades\Route;

Route::get('/chat/conversations', [ChatController::class, 'conversations']);
Route::get('/chat/available-users', [ChatController::class, 'availableUsers']);
Route::get('/chat/unread-summary', [ChatController::class, 'unreadSummary']);
Route::post('/chat/conversations', [ChatController::class, 'startConversation']);
Route::get('/chat/conversations/{conversationId}/messages', [ChatController::class, 'messages']);
Route::post('/chat/conversations/{conversationId}/messages', [ChatController::class, 'sendMessage'])->middleware('throttle:chat.messages');
Route::post('/chat/conversations/{conversationId}/read', [ChatController::class, 'markRead']);
Route::post('/chat/conversations/{conversationId}/typing', [ChatController::class, 'setTyping']);
Route::get('/chat/conversations/{conversationId}/typing', [ChatController::class, 'typingStatus']);
Route::get('/chat/messages/{messageId}/attachment', [ChatController::class, 'attachment']);
Route::get('/chat/groups', [ChatController::class, 'groups']);
Route::post('/chat/groups', [ChatController::class, 'createGroup']);
Route::get('/chat/groups/{groupId}/messages', [ChatController::class, 'groupMessages']);
Route::post('/chat/groups/{groupId}/messages', [ChatController::class, 'sendGroupMessage'])->middleware('throttle:chat.messages');
Route::post('/chat/groups/{groupId}/read', [ChatController::class, 'markGroupRead']);
Route::post('/chat/groups/{groupId}/typing', [ChatController::class, 'setGroupTyping']);
Route::get('/chat/groups/{groupId}/typing', [ChatController::class, 'groupTypingStatus']);
Route::get('/chat/groups/messages/{messageId}/attachment', [ChatController::class, 'groupAttachment']);
