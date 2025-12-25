
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// 初始分析并生成大纲和第一章
export const analyzeAndPlan = async (imageBase64: string): Promise<{ analysis: string; blueprint: string; firstChapter: string }> => {
  const ai = getAI();
  const prompt = `
    你是一位文学泰斗。请针对提供的图片执行以下任务：
    1. 意境分析：描述图片的情绪、光影和深层意象。
    2. 创作蓝图：构思一部以此为背景的长篇小说大纲，包含 6 个章节的标题和剧情梗概。
    3. 序章创作：撰写第一章内容（约 800 字），文字需极其考究，铺垫宏大的世界观。
    
    返回格式（严格遵守，不要包含 Markdown 符号）：
    分析：[分析内容]
    大纲：[大纲内容]
    故事：[第一章内容]
  `;

  const imagePart = {
    inlineData: {
      mimeType: 'image/jpeg',
      data: imageBase64.split(',')[1],
    },
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts: [imagePart, { text: prompt }] },
    config: { temperature: 0.8 }
  });

  const text = response.text || '';
  const analysisMatch = text.match(/分析：([\s\S]*?)大纲：/i);
  const blueprintMatch = text.match(/大纲：([\s\S]*?)故事：/i);
  const storyMatch = text.match(/故事：([\s\S]*)/i);

  return {
    analysis: analysisMatch ? analysisMatch[1].trim() : "分析完成。",
    blueprint: blueprintMatch ? blueprintMatch[1].trim() : "蓝图已构思。",
    firstChapter: storyMatch ? storyMatch[1].trim() : text,
  };
};

// 根据大纲、上下文以及“创作助手”给出的具体提示词续写章节
export const writeNextChapter = async (
  currentStory: string, 
  blueprint: string, 
  chapterIndex: number,
  imageBase64: string | null,
  chatContext: string
): Promise<string> => {
  const ai = getAI();
  const prompt = `
    你正在创作一部长篇巨著。
    
    【核心要求】
    你必须严格根据“创作助手”给出的以下提示和指导来撰写本章节：
    "${chatContext}"
    
    【全书大纲】
    "${blueprint}"
    
    【前文回顾】
    "${currentStory.slice(-2000)}"
    
    【任务】
    请撰写第 ${chapterIndex} 章。
    1. 深度结合上述“创作助手”的提示词，将其转化为具体的故事情节、人物对话或心理描写。
    2. 字数在 1200 字以上，展现文学大师级的文笔。
    3. 承接前文，自然过渡，且符合大纲的整体走向。
    4. 以“第 ${chapterIndex} 章：[标题]”作为开头。
    
    直接返回章节正文，无需任何解释。
  `;

  const parts: any[] = [{ text: prompt }];
  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64.split(',')[1],
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: { parts },
    config: { temperature: 0.85 }
  });

  return response.text || "";
};

export const chatWithStory = async (history: { role: string; text: string }[], message: string, imageBase64: string | null) => {
  const ai = getAI();
  const contents: any[] = history.map(h => ({
    role: h.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));
  const parts: any[] = [{ text: message }];
  if (imageBase64) {
    parts.push({
      inlineData: { mimeType: 'image/jpeg', data: imageBase64.split(',')[1] }
    });
  }
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [...contents, { role: 'user', parts }],
    config: { 
      systemInstruction: "你是文学创作助手。你的任务是为用户提供具体的、可执行的创意提示词和剧情建议。你的每一个回答都应包含明确的‘创作引导’，以便后续章节能够根据你的建议进行撰写。请用专业且富有启发性的中文交流。" 
    }
  });
  return response.text || "暂时无法回应。";
};

export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<string> => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `请用充满故事感的语气朗读：${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { 
        voiceConfig: { 
          prebuiltVoiceConfig: { voiceName } 
        } 
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};
