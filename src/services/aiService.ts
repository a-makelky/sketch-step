import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface Step {
  order: number;
  imageUrl: string;
  instruction: string;
}

export interface TutorialData {
  title: string;
  finalImageUrl: string;
  complexity: string;
  steps: Step[];
}

export async function generateTutorial(
  input: string | File,
  complexity: string
): Promise<TutorialData> {
  const model = "gemini-3.1-pro-preview";
  const imageModel = "gemini-2.5-flash-image";

  let finalImageUrl = "";
  let prompt = "";

  if (typeof input === "string") {
    prompt = input;
    // Generate final image first
    const finalImageResponse = await ai.models.generateContent({
      model: imageModel,
      contents: {
        parts: [{ text: `A clean black and white pencil sketch of: ${input}. Minimalistic, white background, no shading, just line art.` }],
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });

    const imagePart = finalImageResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (imagePart?.inlineData) {
      finalImageUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
    }
  } else {
    // Input is a file (image)
    const reader = new FileReader();
    const base64 = await new Promise<string>((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(input);
    });
    finalImageUrl = `data:image/png;base64,${base64}`;
    prompt = "this image";
  }

  // Generate breakdown
  const breakdownResponse = await ai.models.generateContent({
    model: model,
    contents: `Break down the following drawing into sequential, logical steps for a beginner to draw it. 
    Complexity level: ${complexity}. 
    Focus ONLY on line art (no shading, no coloring). 
    The drawing is: ${prompt}.
    Return a JSON array of steps, each with 'order' and 'instruction'.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            order: { type: Type.INTEGER },
            instruction: { type: Type.STRING }
          },
          required: ["order", "instruction"]
        }
      }
    }
  });

  const stepsData = JSON.parse(breakdownResponse.text);
  const steps: Step[] = [];

  // Generate visual for each step
  // Note: For MVP, we'll generate images sequentially. 
  // To speed up, we could parallelize, but let's be safe first.
  for (const step of stepsData) {
    const stepImageResponse = await ai.models.generateContent({
      model: imageModel,
      contents: {
        parts: [{ text: `A black and white pencil sketch showing Step ${step.order} of drawing ${prompt}: ${step.instruction}. 
        Show only the lines added in this step and previous steps. 
        Minimalistic, white background, clean line art.` }]
      },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });

    const stepImagePart = stepImageResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
    if (stepImagePart?.inlineData) {
      steps.push({
        order: step.order,
        instruction: step.instruction,
        imageUrl: `data:image/png;base64,${stepImagePart.inlineData.data}`
      });
    }
  }

  return {
    title: typeof input === "string" ? input : "My Drawing",
    finalImageUrl,
    complexity,
    steps
  };
}
