
import React, { useState, useRef, useEffect } from 'react';
import { analyzeAndPlan, writeNextChapter, generateSpeech } from './services/geminiService';
import { decodeBase64ToUint8Array, decodeAudioData } from './utils/audioUtils';
import { ChatInterface } from './components/ChatInterface';
import { StoryState } from './types';

interface AdvancedStoryState extends StoryState {
  blueprint: string;
  currentChapter: number;
}

const App: React.FC = () => {
  const [state, setState] = useState<AdvancedStoryState>({
    image: null,
    analysis: '',
    blueprint: '',
    paragraph: '',
    isLoading: false,
    currentChapter: 1,
    error: null,
  });
  
  const [currentGuidance, setCurrentGuidance] = useState<string>('');
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingChapterIndex, setPlayingChapterIndex] = useState<number | null>(null);
  const [isEditingBlueprint, setIsEditingBlueprint] = useState(false);
  const [editableBlueprint, setEditableBlueprint] = useState('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const storyEndRef = useRef<HTMLDivElement>(null);
  const stopSignal = useRef(false);
  const isReadingRef = useRef(false);

  useEffect(() => {
    if (state.paragraph && storyEndRef.current) {
      storyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.paragraph]);

  // 同步编辑状态的大纲
  useEffect(() => {
    setEditableBlueprint(state.blueprint);
  }, [state.blueprint]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setState(prev => ({ 
        ...prev, 
        image: base64, 
        isLoading: true, 
        error: null, 
        paragraph: '', 
        analysis: '', 
        blueprint: '',
        currentChapter: 1 
      }));
      setCurrentGuidance('');
      stopAudio();
      
      try {
        const result = await analyzeAndPlan(base64);
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          analysis: result.analysis, 
          blueprint: result.blueprint,
          paragraph: result.firstChapter 
        }));
      } catch (err) {
        setState(prev => ({ ...prev, isLoading: false, error: '创作启动失败，请检查网络。' }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBlueprint = () => {
    setState(prev => ({ ...prev, blueprint: editableBlueprint }));
    setIsEditingBlueprint(false);
  };

  const generateNextPartOfStory = async () => {
    if (isAutoGenerating || !state.blueprint) return;
    
    setIsAutoGenerating(true);
    stopSignal.current = false;
    
    let chapter = state.currentChapter + 1;
    let currentContent = state.paragraph;

    try {
      const guidanceToUse = currentGuidance || "请根据图片意境和大纲要求，自然推进剧情。";
      // 使用最新的 state.blueprint 进行续写
      const nextPart = await writeNextChapter(currentContent, state.blueprint, chapter, state.image, guidanceToUse);
      currentContent += "\n\n" + nextPart;
      
      setState(prev => ({
        ...prev,
        paragraph: currentContent,
        currentChapter: chapter
      }));
    } catch (err) {
      setState(prev => ({ ...prev, error: '创作过程中断，请重试。' }));
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleStop = () => {
    stopSignal.current = true;
    setIsAutoGenerating(false);
  };

  const stopAudio = () => {
    isReadingRef.current = false;
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsPlaying(false);
    setPlayingChapterIndex(null);
  };

  const handleReadFullStory = async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    if (!state.paragraph) return;
    
    setIsPlaying(true);
    isReadingRef.current = true;

    const chapters = state.paragraph.split(/\n\n(?=第.*章)/);
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      for (let i = 0; i < chapters.length; i++) {
        if (!isReadingRef.current) break;
        
        setPlayingChapterIndex(i + 1);
        const chapterText = chapters[i];
        const voice = (i % 2 === 0) ? 'Kore' : 'Puck';
        const textToRead = chapterText.slice(0, 1500);
        const audioBase64 = await generateSpeech(textToRead, voice);
        
        if (!isReadingRef.current) break;

        const audioData = decodeBase64ToUint8Array(audioBase64);
        const buffer = await decodeAudioData(audioData, audioContextRef.current);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        sourceRef.current = source;
        
        await new Promise<void>((resolve) => {
          source.onended = () => {
            resolve();
          };
          source.start();
        });

        if (i < chapters.length - 1 && isReadingRef.current) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, error: '朗诵过程中遇到问题。' }));
    } finally {
      if (isReadingRef.current) {
        setIsPlaying(false);
        setPlayingChapterIndex(null);
        isReadingRef.current = false;
      }
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(state.paragraph);
    alert('作品已成功复制到剪贴板。');
  };

  return (
    <div className="min-h-screen pb-20 bg-[#f4f7f6]">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">墨影文枢 <span className="text-indigo-500 font-normal">| 协同创作模式</span></h1>
          </div>
          <div className="flex gap-4">
            {state.paragraph && (
              <button onClick={copyToClipboard} className="text-slate-500 hover:text-indigo-600 text-sm font-medium transition-all">导出全文</button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* 左侧栏：灵感图与蓝图 */}
          <div className="lg:col-span-3 space-y-6">
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-200">
              {state.image ? (
                <img src={state.image} className="w-full h-48 object-cover" alt="视觉灵感" />
              ) : (
                <div className="h-48 bg-slate-100 flex items-center justify-center">
                  <label className="cursor-pointer text-slate-400 flex flex-col items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs">上传图片启动创作</span>
                    <input type="file" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>
              )}
              <div className="p-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">图片意境</h3>
                <p className="text-xs text-slate-600 leading-relaxed italic">{state.analysis || "上传图片后自动分析..."}</p>
              </div>
            </div>

            {state.blueprint && (
              <div className="space-y-4">
                <div className="bg-indigo-900 text-indigo-100 p-6 rounded-3xl shadow-xl flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
                      全书蓝图
                    </h3>
                    <button 
                      onClick={() => isEditingBlueprint ? handleSaveBlueprint() : setIsEditingBlueprint(true)}
                      className="text-[10px] font-bold bg-indigo-800 hover:bg-indigo-700 px-3 py-1 rounded-full transition-colors"
                    >
                      {isEditingBlueprint ? "保存修改" : "修改蓝图"}
                    </button>
                  </div>
                  
                  {isEditingBlueprint ? (
                    <textarea 
                      value={editableBlueprint}
                      onChange={(e) => setEditableBlueprint(e.target.value)}
                      className="text-xs bg-indigo-950/50 border border-indigo-700 rounded-xl p-3 h-[300px] focus:outline-none focus:ring-1 focus:ring-indigo-400 text-indigo-100 leading-loose resize-none custom-scrollbar"
                    />
                  ) : (
                    <div className="text-xs space-y-3 leading-loose whitespace-pre-line opacity-80 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {state.blueprint}
                    </div>
                  )}
                </div>
                
                {state.paragraph && (
                  <button 
                    onClick={handleReadFullStory}
                    className={`w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg ${
                      isPlaying 
                        ? 'bg-red-50 text-red-600 border border-red-100' 
                        : 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <div className="flex gap-1">
                          <span className="w-1 h-3 bg-red-400 animate-bounce"></span>
                          <span className="w-1 h-4 bg-red-500 animate-bounce [animation-delay:0.1s]"></span>
                          <span className="w-1 h-3 bg-red-400 animate-bounce [animation-delay:0.2s]"></span>
                        </div>
                        正在朗诵 第 {playingChapterIndex} 章 (停止)
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.983 5.983 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.983 3.983 0 0013 10a3.983 3.983 0 00-1.172-2.828a1 1 0 010-1.415z" clipRule="evenodd" />
                        </svg>
                        全书朗诵 (男女声交替)
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 中间：主创作区 */}
          <div className="lg:col-span-6">
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 min-h-[85vh] p-8 md:p-16 relative flex flex-col">
              {/* 顶部进度条 */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-50">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-1000" 
                  style={{ width: `${(state.currentChapter / 6) * 100}%` }}
                />
              </div>

              {state.isLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <p className="serif text-xl animate-pulse">正在破译视觉密码，构思序章...</p>
                </div>
              ) : state.paragraph ? (
                <article className="flex-1 serif text-slate-800 leading-[2.6] text-lg md:text-xl selection:bg-indigo-100 selection:text-indigo-900">
                  {state.paragraph.split('\n\n').map((p, i) => (
                    <p key={i} className="mb-10 indent-10 text-justify">
                      {p.startsWith('第') ? (
                        <span className="block text-center text-indigo-600 font-bold mb-6 text-2xl tracking-tighter border-y border-indigo-50 py-6 my-10 bg-indigo-50/20">{p}</span>
                      ) : (
                        p
                      )}
                    </p>
                  ))}
                  <div ref={storyEndRef} />
                  
                  {isAutoGenerating && (
                    <div className="py-12 flex flex-col items-center gap-4 text-indigo-400">
                      <div className="flex gap-2">
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0.2s]"></span>
                        <span className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:0.4s]"></span>
                      </div>
                      <p className="text-xs font-bold uppercase tracking-widest">
                        {currentGuidance ? "正根据助手的建议撰写第 " : "正在落笔第 "}{state.currentChapter + 1} 章...
                      </p>
                    </div>
                  )}
                </article>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-300">
                  <p className="serif text-2xl font-light">万字长卷，始于一张图片的触动</p>
                </div>
              )}
              
              {/* 创作控制台 */}
              {state.paragraph && !state.isLoading && state.currentChapter < 6 && (
                <div className="mt-12 flex flex-col items-center gap-6 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100">
                  <div className="text-center">
                    <p className="text-sm font-bold text-indigo-600 mb-1">
                      {currentGuidance ? "✅ 已同步助手提示词" : "💡 提示：在右侧向助手提问以获取灵感"}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm overflow-hidden text-ellipsis whitespace-nowrap">
                      {currentGuidance ? `下章重心：${currentGuidance.slice(0, 50)}...` : "系统将根据默认大纲续写"}
                    </p>
                  </div>
                  
                  <div className="flex gap-4">
                    <button 
                      onClick={generateNextPartOfStory}
                      disabled={isAutoGenerating}
                      className="group bg-indigo-600 text-white px-10 py-5 rounded-full font-bold flex items-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all shadow-2xl shadow-indigo-200 disabled:opacity-50"
                    >
                      {isAutoGenerating ? '正在谱写章节...' : '撰写下一章节'}
                      {!isAutoGenerating && (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      )}
                    </button>
                    
                    {isAutoGenerating && (
                      <button 
                        onClick={handleStop}
                        className="bg-white text-slate-600 px-8 py-5 rounded-full font-bold border border-slate-200 hover:bg-slate-50 transition-all"
                      >
                        停止
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧栏：创作助手交互 */}
          <div className="lg:col-span-3">
             <div className="sticky top-24 space-y-6">
                <ChatInterface 
                  imageBase64={state.image} 
                  storyContext={state.paragraph} 
                  onAssistantReply={setCurrentGuidance}
                />
                
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">当前创作参数</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">已创作字数</span>
                      <span className="font-mono font-bold text-indigo-600">{state.paragraph.length}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">已完成章节</span>
                      <span className="font-mono font-bold text-indigo-600">{state.currentChapter} / 6</span>
                    </div>
                    <div className="pt-3 border-t border-slate-100">
                       <span className="text-[10px] text-slate-400 block mb-1">同步状态</span>
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${currentGuidance ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                          <span className="text-[11px] font-medium text-slate-700">
                            {currentGuidance ? "已关联助手提示" : "等待助手提示..."}
                          </span>
                       </div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
          
        </div>
      </main>

      {state.error && (
        <div className="fixed bottom-10 right-10 bg-slate-900 text-white p-6 rounded-2xl shadow-2xl z-50 flex items-center gap-5 border border-slate-700 animate-in fade-in slide-in-from-right-10">
          <div className="bg-red-500/20 p-2 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm font-medium">{state.error}</p>
          <button onClick={() => setState(s => ({ ...s, error: null }))} className="text-indigo-400 hover:text-indigo-300 font-bold px-2 py-1">重试</button>
        </div>
      )}
    </div>
  );
};

export default App;
