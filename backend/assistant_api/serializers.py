from rest_framework import serializers
from .models import Conversation, ChatMessage, Task

class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = ["id", "title", "detail", "completed", "created_at"]
        read_only_fields = ["id", "created_at"]

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ["role", "content", "created_at"]

class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    class Meta:
        model = Conversation
        fields = ["conversation_id", "title", "created_at", "updated_at", "messages"]
