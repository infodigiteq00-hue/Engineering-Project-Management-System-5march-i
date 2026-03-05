import React from "react";
import { Button } from "@/components/ui/button";
import { Mail, Upload, Send, Eye } from "lucide-react";

interface RecommendationLetterProps {
  projectName?: string;
  client?: string;
  location?: string;
  completionDate?: string;
  poNumber?: string;
  status?: "not-requested" | "requested" | "received";
  requestCount?: number;
  lastRequestDate?: string;
  onRequestLetter?: () => void;
  onUploadLetter?: () => void;
  onSendAnother?: () => void;
  onViewLetter?: () => void;
}

const RecommendationLetter: React.FC<RecommendationLetterProps> = ({
  projectName = "Hindustan Petroleum Refinery",
  client = "HPCL",
  location = "Vishakhapatnam, AP",
  completionDate = "Jan 20, 2024",
  poNumber = "HPCL-2023-RF-025",
  status = "requested",
  requestCount = 2,
  lastRequestDate = "Nov 8, 2025, 01:49 AM",
  onRequestLetter,
  onUploadLetter,
  onSendAnother,
  onViewLetter,
}) => {
  const getStatusDisplay = () => {
    switch (status) {
      case "not-requested":
        return {
          dotColor: "bg-gray-400",
          text: "Not Requested",
          textColor: "text-gray-600",
        };
      case "requested":
        return {
          dotColor: "bg-yellow-500",
          text: "Requested",
          textColor: "text-yellow-600",
        };
      case "received":
        return {
          dotColor: "bg-green-500",
          text: "Received",
          textColor: "text-green-600",
        };
      default:
        return {
          dotColor: "bg-gray-400",
          text: "Not Requested",
          textColor: "text-gray-600",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Mail className="w-5 h-5 text-blue-600" />
        Recommendation Letter
      </h3>
      <div className="space-y-4">
        {/* Status Indicator */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`w-3 h-3 rounded-full ${statusDisplay.dotColor}`}></div>
          <span className={`font-medium ${statusDisplay.textColor}`}>
            {statusDisplay.text}
          </span>
          {status === "requested" && (
            <>
              <span className="text-sm text-orange-600 ml-2">
                {requestCount} sent
              </span>
              <span className="text-xs text-orange-500">
                Last: {lastRequestDate}
              </span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {status === "not-requested" && (
            <>
              <Button
                onClick={onRequestLetter}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Request Letter
              </Button>
              <Button
                onClick={onUploadLetter}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Letter
              </Button>
            </>
          )}

          {status === "requested" && (
            <>
              <Button
                onClick={onSendAnother}
                className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Another
              </Button>
              <Button
                onClick={onUploadLetter}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload Letter
              </Button>
            </>
          )}

          {status === "received" && (
            <Button
              onClick={onViewLetter}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Letter
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationLetter;

