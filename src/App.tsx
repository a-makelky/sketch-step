/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  auth, db, googleProvider, signInWithPopup, signOut, 
  collection, doc, setDoc, getDocs, query, where, orderBy, Timestamp 
} from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { generateTutorial, TutorialData, Step } from "./services/aiService";
import { 
  Search, Plus, History, LogOut, ChevronDown, ChevronUp, 
  Download, Printer, Loader2, Image as ImageIcon, ArrowRight
} from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [complexity, setComplexity] = useState("simple");
  const [loading, setLoading] = useState(false);
  const [tutorial, setTutorial] = useState<TutorialData | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  const tutorialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) fetchHistory(u.uid);
    });
    return unsubscribe;
  }, []);

  const fetchHistory = async (uid: string) => {
    const q = query(
      collection(db, "tutorials"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const handleGenerate = async () => {
    if (!input && !file) return;
    setLoading(true);
    try {
      const data = await generateTutorial(file || input, complexity);
      setTutorial(data);
      
      // Initialize all steps as expanded
      const expanded: Record<number, boolean> = {};
      data.steps.forEach(s => expanded[s.order] = true);
      setExpandedSteps(expanded);

      // Save to history if logged in
      if (user) {
        const tutorialId = crypto.randomUUID();
        await setDoc(doc(db, "tutorials", tutorialId), {
          ...data,
          userId: user.uid,
          createdAt: Timestamp.now()
        });
        fetchHistory(user.uid);
      }
    } catch (error) {
      console.error("Generation failed:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleStep = (order: number) => {
    setExpandedSteps(prev => ({ ...prev, [order]: !prev[order] }));
  };

  const handleExportPDF = async () => {
    if (!tutorial || !tutorialRef.current) return;
    
    const pdf = new jsPDF("p", "mm", "a4");
    const steps = tutorialRef.current.querySelectorAll(".tutorial-step");
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as HTMLElement;
      const canvas = await html2canvas(step, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      
      if (i > 0) pdf.addPage();
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    }
    
    pdf.save(`${tutorial.title.replace(/\s+/g, "_")}_tutorial.pdf`);
  };

  return (
    <div className="min-h-screen bg-white text-[#37352f] font-sans selection:bg-[#ebeced]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#e9e9e7] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setTutorial(null)}>
          <div className="w-8 h-8 bg-[#37352f] rounded flex items-center justify-center">
            <Plus className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">SketchStep</h1>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="p-2 hover:bg-[#efefef] rounded-md transition-colors"
                title="History"
              >
                <History className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-full bg-[#efefef] flex items-center justify-center overflow-hidden border border-[#e9e9e7]">
                {user.photoURL ? <img src={user.photoURL} alt="avatar" /> : user.email?.[0].toUpperCase()}
              </div>
              <button 
                onClick={() => signOut(auth)}
                className="p-2 hover:bg-[#efefef] rounded-md transition-colors text-red-500"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="px-3 py-1.5 text-sm font-medium border border-[#e9e9e7] rounded-md hover:bg-[#efefef] transition-colors"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        {!tutorial ? (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold tracking-tight">What do you want to draw?</h2>
              <p className="text-[#787774] text-lg">Enter a description or upload an image to get a step-by-step guide.</p>
            </div>

            <div className="space-y-6 bg-[#f7f7f5] p-8 rounded-xl border border-[#e9e9e7]">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#787774]">Prompt</label>
                <div className="relative">
                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="e.g. A minimalist cat, a mountain landscape..."
                    className="w-full bg-white border border-[#e9e9e7] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#37352f]/10 transition-all text-lg"
                  />
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-[#787774] w-5 h-5" />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#787774]">Complexity</label>
                  <div className="flex bg-white border border-[#e9e9e7] rounded-lg p-1">
                    {["simple", "moderate", "complex"].map((c) => (
                      <button
                        key={c}
                        onClick={() => setComplexity(c)}
                        className={cn(
                          "flex-1 py-2 text-sm font-medium rounded-md transition-all capitalize",
                          complexity === c ? "bg-[#37352f] text-white shadow-sm" : "hover:bg-[#efefef]"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#787774]">Reference Image (Optional)</label>
                  <label className="flex items-center justify-center gap-2 w-full bg-white border border-[#e9e9e7] border-dashed rounded-lg py-2 cursor-pointer hover:bg-[#efefef] transition-colors">
                    <ImageIcon className="w-4 h-4 text-[#787774]" />
                    <span className="text-sm font-medium">{file ? file.name : "Upload Image"}</span>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <button 
                onClick={handleGenerate}
                disabled={loading || (!input && !file)}
                className="w-full bg-[#37352f] text-white py-4 rounded-lg font-bold text-lg hover:bg-black transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating Tutorial...
                  </>
                ) : (
                  <>
                    Generate Steps
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-[#e9e9e7] pb-6">
              <div>
                <button 
                  onClick={() => setTutorial(null)}
                  className="text-sm text-[#787774] hover:text-[#37352f] mb-2 flex items-center gap-1"
                >
                  ← Back to search
                </button>
                <h2 className="text-3xl font-bold tracking-tight">{tutorial.title}</h2>
                <p className="text-[#787774] capitalize">{tutorial.complexity} breakdown</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleExportPDF}
                  className="p-2 border border-[#e9e9e7] rounded-md hover:bg-[#efefef] transition-colors"
                  title="Export PDF"
                >
                  <Download className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => window.print()}
                  className="p-2 border border-[#e9e9e7] rounded-md hover:bg-[#efefef] transition-colors"
                  title="Print"
                >
                  <Printer className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-12" ref={tutorialRef}>
              {/* Final Result Preview */}
              <div className="bg-[#f7f7f5] p-6 rounded-xl border border-[#e9e9e7] space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#787774]">Final Goal</h3>
                <img 
                  src={tutorial.finalImageUrl} 
                  alt="Final result" 
                  className="w-full max-w-md mx-auto rounded-lg shadow-sm border border-[#e9e9e7] bg-white"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Steps */}
              <div className="space-y-8">
                {tutorial.steps.map((step) => (
                  <div 
                    key={step.order} 
                    className="tutorial-step border border-[#e9e9e7] rounded-xl overflow-hidden bg-white shadow-sm"
                  >
                    <button 
                      onClick={() => toggleStep(step.order)}
                      className="w-full flex items-center justify-between p-4 bg-[#f7f7f5] hover:bg-[#efefef] transition-colors border-b border-[#e9e9e7]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-[#37352f] text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {step.order}
                        </span>
                        <span className="font-bold">Step {step.order}</span>
                      </div>
                      {expandedSteps[step.order] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    
                    {expandedSteps[step.order] && (
                      <div className="p-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
                        <p className="text-lg leading-relaxed">{step.instruction}</p>
                        <div className="aspect-square w-full max-w-md mx-auto bg-white border border-[#e9e9e7] rounded-lg overflow-hidden flex items-center justify-center p-4">
                          <img 
                            src={step.imageUrl} 
                            alt={`Step ${step.order}`} 
                            className="max-w-full max-h-full object-contain mix-blend-multiply"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* History Sidebar */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative w-full max-w-md bg-white h-full shadow-2xl border-l border-[#e9e9e7] flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-[#e9e9e7] flex items-center justify-between">
              <h3 className="text-xl font-bold">History</h3>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-[#efefef] rounded-md">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-12 text-[#787774]">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No history yet.</p>
                </div>
              ) : (
                history.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => {
                      setTutorial(item);
                      setShowHistory(false);
                    }}
                    className="group p-4 border border-[#e9e9e7] rounded-xl hover:border-[#37352f] cursor-pointer transition-all bg-[#f7f7f5] hover:bg-white"
                  >
                    <div className="flex gap-4">
                      <img src={item.finalImageUrl} className="w-16 h-16 rounded-md border border-[#e9e9e7] bg-white object-cover" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold truncate">{item.title}</h4>
                        <p className="text-xs text-[#787774] mt-1">
                          {new Date(item.createdAt.seconds * 1000).toLocaleDateString()} • {item.complexity}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-3xl mx-auto px-4 py-12 border-t border-[#e9e9e7] text-center text-sm text-[#787774]">
        <p>© 2026 SketchStep. Minimalist Drawing Guides.</p>
      </footer>
    </div>
  );
}
