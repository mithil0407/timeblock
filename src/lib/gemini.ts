import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface ParsedTask {
    title: string;
    description: string | null;
    deadline: string | null;
    explicitDuration: number | null;
    taskType: string;
    suggestedCategory: string;
    energyRequirement: "high" | "medium" | "low";
}

interface DurationEstimate {
    estimatedMinutes: number;
    confidence: "high" | "medium" | "low";
    reasoning: string;
}

interface PriorityAssessment {
    priority: number;
    reasoning: string;
}

interface ScheduleOptimization {
    reasoning: string;
    schedule: Array<{
        taskId: string;
        newStart: string;
        newEnd: string;
        reason: string;
    }>;
}

interface TaskDescriptionResult {
    description: string;
}

export async function callGemini<T>({
    prompt,
    temperature = 0.7,
}: {
    prompt: string;
    temperature?: number;
}): Promise<T> {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            generationConfig: {
                temperature,
                responseMimeType: "application/json",
            },
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        return JSON.parse(text) as T;
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to get AI response");
    }
}

export async function parseTaskInput(
    userInput: string,
    taskHistory: string[] = [],
    options?: { timeZone?: string; now?: Date }
): Promise<ParsedTask> {
    const timeZone = options?.timeZone || "UTC";
    const now = options?.now || new Date();
    const localNow = new Intl.DateTimeFormat("en-US", {
        timeZone,
        dateStyle: "full",
        timeStyle: "short",
    }).format(now);
    const prompt = `
Parse this task input and extract structured information:
"${userInput}"

User's task history shows they commonly do these tasks:
${JSON.stringify(taskHistory)}

Return JSON with:
{
  "title": "Clean task title",
  "description": "Additional context if any, or null",
  "deadline": "ISO timestamp if mentioned (e.g., 'tomorrow' means next day at 5pm, 'EOD' means today at 6pm), null otherwise",
  "explicitDuration": "Minutes if mentioned (e.g., '30 min' = 30, '2 hours' = 120), null otherwise",
  "taskType": "Category matching user history if possible, or one of: creative, admin, meetings, deep_work, communication, planning",
  "suggestedCategory": "Your best guess at category",
  "energyRequirement": "high, medium, or low based on task nature"
}

User timezone: ${timeZone}
Current local date/time for reference: ${localNow}
`;

    try {
        return await callGemini<ParsedTask>({ prompt });
    } catch (error) {
        // Fallback parsing
        console.error("Failed to parse with AI, using fallback:", error);
        return {
            title: userInput.slice(0, 100),
            description: null,
            deadline: null,
            explicitDuration: null,
            taskType: "admin",
            suggestedCategory: "general",
            energyRequirement: "medium",
        };
    }
}

export async function estimateTaskDuration(
    taskDescription: string,
    category: string,
    historicalData: Array<{ duration: number; completedAt: string }> = []
): Promise<DurationEstimate> {
    const prompt = `
Estimate how long this task will take in minutes:
Task: "${taskDescription}"
Category: "${category}"

${historicalData.length > 0
            ? `
User's historical data for similar "${category}" tasks:
${JSON.stringify(historicalData.map((h) => ({ duration: h.duration, completed: h.completedAt })))}
`
            : "No historical data available."
        }

Return JSON:
{
  "estimatedMinutes": number (minimum 15, maximum 480),
  "confidence": "high/medium/low",
  "reasoning": "Brief explanation"
}
`;

    try {
        return await callGemini<DurationEstimate>({ prompt });
    } catch (error) {
        console.error("Failed to estimate duration:", error);
        return {
            estimatedMinutes: 60,
            confidence: "low",
            reasoning: "Default estimate due to AI unavailability",
        };
    }
}

export async function assessPriority(
    taskTitle: string,
    description: string | null,
    category: string,
    deadline: string | null,
    otherTasks: Array<{ title: string; priority: number; deadline?: string }>
): Promise<PriorityAssessment> {
    const prompt = `
Assess priority for this task:

Task: "${taskTitle}"
Description: "${description || "None"}"
Category: "${category}"
Deadline: ${deadline ? deadline : "No deadline specified"}

User's other tasks today:
${JSON.stringify(otherTasks)}

Priority scale:
1 = Low (can wait, no deadline, nice-to-have)
2 = Normal (should be done this week)
3 = Medium (should be done in next 2 days)
4 = High (must be done today)
5 = Urgent (critical, needs immediate attention)

Consider:
- Deadline urgency
- Task importance relative to other tasks
- Category (client work typically higher priority)

Return JSON:
{
  "priority": 1-5,
  "reasoning": "Why this priority"
}
`;

    try {
        return await callGemini<PriorityAssessment>({ prompt });
    } catch (error) {
        console.error("Failed to assess priority:", error);
        // Fallback based on deadline
        let priority = 3;
        if (deadline) {
            const deadlineDate = new Date(deadline);
            const hoursUntil =
                (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60);
            if (hoursUntil <= 4) priority = 5;
            else if (hoursUntil <= 24) priority = 4;
            else if (hoursUntil <= 48) priority = 3;
            else priority = 2;
        }
        return {
            priority,
            reasoning: "Priority based on deadline calculation",
        };
    }
}

export async function optimizeSchedule({
    tasks,
    timeSaved,
    currentTime,
    energyLevels,
    workingHours,
}: {
    tasks: Array<{
        id: string;
        title: string;
        duration: number;
        priority: number;
        currentStart: string;
        currentEnd: string;
        energyRequirement: string;
    }>;
    timeSaved: number;
    currentTime: string;
    energyLevels: Record<string, string>;
    workingHours: { start: number; end: number };
}): Promise<ScheduleOptimization> {
    const prompt = `
Re-optimize this schedule after time was freed up:

REMAINING TASKS:
${JSON.stringify(tasks)}

TIME SAVED: ${timeSaved} minutes
CURRENT TIME: ${currentTime}

USER ENERGY LEVELS:
${JSON.stringify(energyLevels)}

USER WORKING HOURS:
Start: ${workingHours.start}:00
End: ${workingHours.end}:00

Rules:
1. Move tasks earlier if possible to finish day sooner
2. Respect energy level requirements (high-energy tasks during high-energy times)
3. Maintain priority order (higher priority tasks earlier)
4. Keep buffer time (at least 5 min) between tasks
5. Don't schedule before current time

Return JSON:
{
  "reasoning": "Overall strategy for the new schedule",
  "schedule": [
    {
      "taskId": "uuid",
      "newStart": "ISO timestamp",
      "newEnd": "ISO timestamp",
      "reason": "Why this time"
    }
  ]
}
`;

    try {
        return await callGemini<ScheduleOptimization>({ prompt });
    } catch (error) {
        console.error("Failed to optimize schedule:", error);
        // Return empty optimization (no changes)
        return {
            reasoning: "Unable to optimize due to AI unavailability",
            schedule: [],
        };
    }
}

export async function generateTaskDescription({
    taskTitle,
    parsedDescription,
    userContext,
    businessContext,
}: {
    taskTitle: string;
    parsedDescription: string | null;
    userContext: string | null;
    businessContext: string;
}): Promise<TaskDescriptionResult> {
    const prompt = `
You are generating a detailed Google Calendar event description for a time block.

Task title: "${taskTitle}"
User-provided context: "${userContext || "None"}"
Parsed context: "${parsedDescription || "None"}"

Business context (for grounding; do not repeat verbatim unless relevant):
${businessContext}

Write a concise, action-oriented description that clarifies what work will be done.
Include sections only if relevant:
- Objective
- Key steps
- Assets/links
- Metrics or KPI targets

Do not invent specific numbers or links that are not in context.
Return JSON:
{
  "description": "string"
}
`;

    try {
        return await callGemini<TaskDescriptionResult>({ prompt, temperature: 0.4 });
    } catch (error) {
        console.error("Failed to generate task description:", error);
        return {
            description: userContext || parsedDescription || taskTitle,
        };
    }
}
