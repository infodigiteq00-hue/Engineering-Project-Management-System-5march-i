import React from "react";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VDCRSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  resultCount?: number;
  totalCount?: number;
}

const VDCRSearchBar: React.FC<VDCRSearchBarProps> = ({
  searchQuery,
  onSearchChange,
  resultCount,
  totalCount
}) => {
  return (
    <div className="mb-4 w-full min-w-0">
      <div className="relative w-full min-w-0">
        <div className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 flex-shrink-0 pointer-events-none">
          <Search className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <Input
          type="text"
          placeholder="Search by document name, equipment tag, revision, status, client doc, internal doc, or any field..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full min-w-0 pl-9 sm:pl-10 pr-10 h-10 sm:h-12 text-sm sm:text-base border-2 border-gray-300 focus:border-blue-500 rounded-lg shadow-sm focus:shadow-md transition-all duration-200 placeholder:text-gray-400"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSearchChange("")}
            className="absolute right-1.5 sm:right-2 top-1/2 transform -translate-y-1/2 h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-gray-100 rounded-full flex-shrink-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </Button>
        )}
      </div>
      {searchQuery && (
        <div className="mt-2 text-xs sm:text-sm text-gray-600 flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {resultCount !== undefined && totalCount !== undefined ? (
              <>
                Showing <span className="text-blue-600 font-bold">{resultCount}</span> of{" "}
                <span className="text-gray-700 font-bold">{totalCount}</span> records
              </>
            ) : (
              "Searching..."
            )}
          </span>
        </div>
      )}
    </div>
  );
};

export default VDCRSearchBar;

