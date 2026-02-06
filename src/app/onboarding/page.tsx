"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Clock, Zap, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkingHours {
  start: number;
  end: number;
  maxExtension: number;
}

interface EnergyLevel {
  timeRange: string;
  level: "high" | "medium" | "low";
}

const STEPS = [
  { id: "welcome", title: "Welcome", icon: Clock },
  { id: "working-hours", title: "Working Hours", icon: Clock },
  { id: "energy-levels", title: "Energy Levels", icon: Zap },
  { id: "complete", title: "All Set!", icon: Check },
];

const DEFAULT_ENERGY_LEVELS: EnergyLevel[] = [
  { timeRange: "09:00-12:00", level: "high" },
  { timeRange: "12:00-14:00", level: "low" },
  { timeRange: "14:00-17:00", level: "medium" },
  { timeRange: "17:00-20:00", level: "low" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [workingHours, setWorkingHours] = useState<WorkingHours>({
    start: 9,
    end: 18,
    maxExtension: 2,
  });
  
  const [energyLevels, setEnergyLevels] = useState<EnergyLevel[]>(DEFAULT_ENERGY_LEVELS);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    
    try {
      // Save working hours
      await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memoryType: "working_hours",
          key: "default",
          value: workingHours,
        }),
      });

      // Save energy levels
      for (const energy of energyLevels) {
        await fetch("/api/memory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memoryType: "energy_levels",
            key: energy.timeRange,
            value: { level: energy.level, suitable_for: getSuitableTaskTypes(energy.level) },
          }),
        });
      }

      // Mark onboarding as complete
      await fetch("/api/user/onboarding", {
        method: "POST",
      });

      toast({
        title: "You're all set!",
        description: "Your preferences have been saved. Let's start scheduling!",
        variant: "success",
      });

      router.push("/dashboard");
    } catch (error) {
      console.error("Failed to save preferences:", error);
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateEnergyLevel = (index: number, level: "high" | "medium" | "low") => {
    const updated = [...energyLevels];
    updated[index] = { ...updated[index], level };
    setEnergyLevels(updated);
  };

  const getSuitableTaskTypes = (level: string): string[] => {
    switch (level) {
      case "high":
        return ["deep_work", "creative", "complex_analysis"];
      case "medium":
        return ["meetings", "communication", "planning"];
      case "low":
        return ["admin", "routine", "simple_tasks"];
      default:
        return [];
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep].id) {
      case "welcome":
        return <WelcomeStep />;
      case "working-hours":
        return (
          <WorkingHoursStep
            workingHours={workingHours}
            onChange={setWorkingHours}
          />
        );
      case "energy-levels":
        return (
          <EnergyLevelsStep
            energyLevels={energyLevels}
            onUpdate={updateEnergyLevel}
            workingHours={workingHours}
          />
        );
      case "complete":
        return <CompleteStep />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center",
                index < STEPS.length - 1 && "flex-1"
              )}
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
                  index < currentStep
                    ? "bg-primary text-primary-foreground"
                    : index === currentStep
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {index < currentStep ? (
                  <Check className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors",
                    index < currentStep ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card className="border-0 shadow-xl">
          {renderStep()}

          {/* Navigation */}
          <div className="flex items-center justify-between p-6 pt-0">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>

            {currentStep === STEPS.length - 1 ? (
              <Button onClick={handleComplete} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Get Started
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// Step Components

function WelcomeStep() {
  return (
    <>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
          <Clock className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Welcome to TimeBlock AI</CardTitle>
        <CardDescription className="text-base mt-2">
          Let&apos;s personalize your experience to help you work smarter
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm">1</span>
            </div>
            <span>Set your working hours</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm">2</span>
            </div>
            <span>Tell us about your energy patterns</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-sm">3</span>
            </div>
            <span>Start scheduling intelligently!</span>
          </div>
        </div>
        <p className="text-xs text-center text-muted-foreground pt-2">
          This only takes about 1 minute
        </p>
      </CardContent>
    </>
  );
}

function WorkingHoursStep({
  workingHours,
  onChange,
}: {
  workingHours: WorkingHours;
  onChange: (hours: WorkingHours) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    value: i.toString(),
    label: formatHour(i),
  }));

  return (
    <>
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-xl">Your Working Hours</CardTitle>
        <CardDescription>
          When do you typically work? We&apos;ll only schedule tasks during these hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Select
              value={workingHours.start.toString()}
              onValueChange={(v) =>
                onChange({ ...workingHours, start: parseInt(v, 10) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.slice(5, 14).map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>End Time</Label>
            <Select
              value={workingHours.end.toString()}
              onValueChange={(v) =>
                onChange({ ...workingHours, end: parseInt(v, 10) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.slice(14, 23).map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Max Extension (hours)</Label>
          <p className="text-xs text-muted-foreground mb-2">
            How long past your end time can we schedule if needed?
          </p>
          <Select
            value={workingHours.maxExtension.toString()}
            onValueChange={(v) =>
              onChange({ ...workingHours, maxExtension: parseInt(v, 10) })
            }
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[0, 1, 2, 3, 4].map((h) => (
                <SelectItem key={h} value={h.toString()}>
                  {h} hour{h !== 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="p-4 bg-secondary/50 rounded-lg">
          <p className="text-sm text-center">
            <span className="font-medium">
              {formatHour(workingHours.start)} - {formatHour(workingHours.end)}
            </span>
            <span className="text-muted-foreground">
              {" "}({workingHours.end - workingHours.start} hours/day)
            </span>
          </p>
        </div>
      </CardContent>
    </>
  );
}

function EnergyLevelsStep({
  energyLevels,
  onUpdate,
  workingHours,
}: {
  energyLevels: EnergyLevel[];
  onUpdate: (index: number, level: "high" | "medium" | "low") => void;
  workingHours: WorkingHours;
}) {
  const energyColors = {
    high: "bg-green-500",
    medium: "bg-yellow-500",
    low: "bg-red-400",
  };

  const energyLabels = {
    high: "High Focus",
    medium: "Moderate",
    low: "Low Energy",
  };

  return (
    <>
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-xl">Your Energy Patterns</CardTitle>
        <CardDescription>
          When are you most productive? We&apos;ll match demanding tasks to your high-energy times.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {energyLevels.map((energy, index) => {
            const [startStr] = energy.timeRange.split("-");
            const startHour = parseInt(startStr.split(":")[0], 10);
            
            // Only show if within working hours range
            if (startHour < workingHours.start || startHour >= workingHours.end) {
              return null;
            }

            return (
              <div
                key={energy.timeRange}
                className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      energyColors[energy.level]
                    )}
                  />
                  <span className="text-sm font-medium">
                    {formatTimeRange(energy.timeRange)}
                  </span>
                </div>
                <Select
                  value={energy.level}
                  onValueChange={(v) =>
                    onUpdate(index, v as "high" | "medium" | "low")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["high", "medium", "low"] as const).map((level) => (
                      <SelectItem key={level} value={level}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full",
                              energyColors[level]
                            )}
                          />
                          {energyLabels[level]}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        <div className="p-4 bg-blue-50 rounded-lg text-sm">
          <p className="text-blue-800">
            <strong>Pro tip:</strong> Most people have peak focus in the morning. 
            We&apos;ll schedule your hardest tasks during high-energy periods.
          </p>
        </div>
      </CardContent>
    </>
  );
}

function CompleteStep() {
  return (
    <>
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <CardTitle className="text-2xl">You&apos;re Ready!</CardTitle>
        <CardDescription className="text-base mt-2">
          Your preferences have been configured. TimeBlock AI will now:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50">
            <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <span>Schedule demanding tasks during your high-energy times</span>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50">
            <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <span>Respect your working hours boundaries</span>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50">
            <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <span>Learn and improve from your task completion patterns</span>
          </div>
        </div>
      </CardContent>
    </>
  );
}

// Utilities

function formatHour(hour: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:00 ${suffix}`;
}

function formatTimeRange(range: string): string {
  const [start, end] = range.split("-");
  const startHour = parseInt(start.split(":")[0], 10);
  const endHour = parseInt(end.split(":")[0], 10);
  return `${formatHour(startHour)} - ${formatHour(endHour)}`;
}
