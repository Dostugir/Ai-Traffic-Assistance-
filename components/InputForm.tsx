import React, { useState, useRef, useEffect } from 'react';
import { TrafficInput } from '../types';
import { getLiveLocation } from '../services/location';

interface InputFormProps {
  onSubmit: (input: TrafficInput) => void;
  isLoading: boolean;
}

const InputForm: React.FC<InputFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<TrafficInput>({
    location: '',
    destination: '',
    time: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', weekday: 'long' }),
    weather: 'Sunny',
    report: '',
    image: undefined,
  });
  const [locating, setLocating] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setIsCameraOpen(true);
      // Wait for state update and render
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch (err) {
      console.error("Camera error:", err);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setFormData(prev => ({ ...prev, image: dataUrl }));
        stopCamera();
      }
    }
  };

  const handleGeolocation = async () => {
    setLocating(true);
    try {
        const userPos = await getLiveLocation();
        
        setFormData(prev => ({
            ...prev,
            location: `Current Location (${userPos.lat.toFixed(4)}, ${userPos.lng.toFixed(4)})`,
            lat: userPos.lat,
            lng: userPos.lng
        }));
    } catch (error: any) {
        console.warn("Geolocation Error:", error.message);
        alert(`GPS failed: ${error.message}. Please enter location manually.`);
    } finally {
        setLocating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.location && !formData.image) {
        alert("Please enter a location or upload a map image.");
        return;
    }
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/80 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-slate-700/50 relative overflow-hidden group">
      {/* Decorative Glow */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500"></div>
      
      <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-sky-400 mb-6 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.806-.984A1 1 0 0120.206 6.36L15 8.764m0 0L9 7" />
        </svg>
        Traffic Detective Intel
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">Start Point</label>
          <div className="relative">
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3 pr-12 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-600"
              placeholder="Enter location or use live GPS"
            />
            <button
                type="button"
                onClick={handleGeolocation}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-400 hover:text-white transition-colors rounded-full hover:bg-emerald-500/20"
                title="Use Current Location"
            >
                {locating ? (
                    <span className="relative flex h-5 w-5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-5 w-5 bg-emerald-500"></span>
                    </span>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">Destination</label>
          <input
            type="text"
            name="destination"
            value={formData.destination}
            onChange={handleChange}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-600"
            placeholder="Where are you going?"
          />
        </div>

        <div>
          <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">Time & Day</label>
          <input
            type="text"
            name="time"
            value={formData.time}
            onChange={handleChange}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-600"
          />
        </div>

        <div>
          <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">Weather</label>
          <select
            name="weather"
            value={formData.weather}
            onChange={handleChange}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
          >
            <option value="Sunny">Sunny</option>
            <option value="Rain">Rain</option>
            <option value="Heavy Rain">Heavy Rain</option>
            <option value="Cloudy">Cloudy</option>
            <option value="Foggy">Foggy</option>
          </select>
        </div>

        <div>
           <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">Map Screenshot</label>
           
           {isCameraOpen ? (
             <div className="relative w-full h-[200px] bg-black rounded-xl overflow-hidden border border-emerald-500/50">
               <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
               <canvas ref={canvasRef} className="hidden"></canvas>
               <div className="absolute bottom-4 left-0 w-full flex justify-center gap-4">
                 <button 
                   type="button" 
                   onClick={capturePhoto} 
                   className="bg-white text-black p-2 rounded-full shadow-lg border-4 border-slate-300 hover:border-emerald-500 transition-all"
                   title="Capture"
                 >
                   <div className="w-8 h-8 bg-red-500 rounded-full"></div>
                 </button>
                 <button 
                   type="button" 
                   onClick={stopCamera} 
                   className="bg-slate-900/80 text-white px-3 py-1 rounded-full text-xs border border-white/20"
                 >
                   Cancel
                 </button>
               </div>
             </div>
           ) : (
             <div className="flex gap-2">
                 <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 h-[50px] bg-slate-900/50 border border-slate-600 hover:border-emerald-500 rounded-xl flex items-center justify-center gap-2 text-slate-400 hover:text-emerald-400 transition-all text-sm"
                  >
                     {formData.image ? (
                         <>
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                           </svg>
                           <span className="text-emerald-500 font-medium">Image Ready</span>
                         </>
                     ) : (
                         <>
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                           </svg>
                           Upload File
                         </>
                     )}
                  </button>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="w-[50px] h-[50px] bg-slate-900/50 border border-slate-600 hover:border-emerald-500 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-400 transition-all"
                    title="Use Camera"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
             </div>
           )}
        </div>

        <div className="md:col-span-2">
          <label className="block text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">What do you see?</label>
          <textarea
            name="report"
            value={formData.report}
            onChange={handleChange}
            rows={2}
            className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3 text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-600"
            placeholder="e.g. Red line on map, police standing..."
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className={`mt-6 w-full py-4 px-4 rounded-xl font-bold text-slate-950 uppercase tracking-widest transition-all ${
          isLoading 
            ? 'bg-slate-600 cursor-not-allowed' 
            : 'bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)] hover:shadow-[0_0_30px_rgba(52,211,153,0.6)] transform hover:-translate-y-0.5'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing Satellite Data...
          </span>
        ) : (
          "Consult Jhuma"
        )}
      </button>
    </form>
  );
};

export default InputForm;