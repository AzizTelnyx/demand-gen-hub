'use client';

import { useState, useRef } from 'react';
import { BriefData } from '../index';

interface Props {
  onSubmit: (data: BriefData) => void;
}

export function BriefInput({ onSubmit }: Props) {
  const [notes, setNotes] = useState('');
  const [googleDocs, setGoogleDocs] = useState<string[]>([]);
  const [googleSheets, setGoogleSheets] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [newDocUrl, setNewDocUrl] = useState('');
  const [newSheetUrl, setNewSheetUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addGoogleDoc = () => {
    if (newDocUrl && newDocUrl.includes('docs.google.com')) {
      setGoogleDocs([...googleDocs, newDocUrl]);
      setNewDocUrl('');
    }
  };

  const addGoogleSheet = () => {
    if (newSheetUrl && newSheetUrl.includes('docs.google.com/spreadsheets')) {
      setGoogleSheets([...googleSheets, newSheetUrl]);
      setNewSheetUrl('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadedFiles([...uploadedFiles, ...Array.from(files)]);
    }
  };

  const removeDoc = (index: number) => {
    setGoogleDocs(googleDocs.filter((_, i) => i !== index));
  };

  const removeSheet = (index: number) => {
    setGoogleSheets(googleSheets.filter((_, i) => i !== index));
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    onSubmit({ notes, googleDocs, googleSheets, uploadedFiles });
  };

  const hasContent = notes || googleDocs.length > 0 || googleSheets.length > 0 || uploadedFiles.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Create Campaign</h2>
        <p className="text-gray-400">Add your brief materials. Use any or all input methods.</p>
      </div>

      {/* Notes / Context */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          📝 Notes / Context
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          placeholder="Target enterprise contact centers evaluating voice AI. Goal: demo requests. Focus US/UK. $15K/month budget..."
        />
      </div>

      {/* Google Docs */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          📄 Google Docs (briefs, messaging docs)
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="url"
            value={newDocUrl}
            onChange={(e) => setNewDocUrl(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="https://docs.google.com/document/d/..."
          />
          <button
            onClick={addGoogleDoc}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
        {googleDocs.length > 0 && (
          <div className="space-y-2">
            {googleDocs.map((url, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
                <span className="text-sm text-gray-300 truncate flex-1">{url}</span>
                <button
                  onClick={() => removeDoc(index)}
                  className="ml-2 text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Google Sheets */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          📊 Google Sheets (account lists, keyword research)
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="url"
            value={newSheetUrl}
            onChange={(e) => setNewSheetUrl(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          <button
            onClick={addGoogleSheet}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Add
          </button>
        </div>
        {googleSheets.length > 0 && (
          <div className="space-y-2">
            {googleSheets.map((url, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
                <span className="text-sm text-gray-300 truncate flex-1">{url}</span>
                <button
                  onClick={() => removeSheet(index)}
                  className="ml-2 text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          📎 Upload Files (PDF, DOCX, CSV, XLSX)
        </label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-600 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.csv,.xlsx,.xls"
            onChange={handleFileUpload}
            className="hidden"
          />
          <p className="text-gray-400">Drop files here or click to browse</p>
          <p className="text-sm text-gray-500 mt-1">PDF, DOCX, CSV, XLSX accepted</p>
        </div>
        {uploadedFiles.length > 0 && (
          <div className="space-y-2 mt-2">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2">
                <span className="text-sm text-gray-300">✓ {file.name}</span>
                <button
                  onClick={() => removeFile(index)}
                  className="ml-2 text-gray-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSubmit}
          disabled={!hasContent}
          className={`px-6 py-3 rounded-lg font-medium transition-colors ${
            hasContent
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Analyze Brief →
        </button>
      </div>
    </div>
  );
}
