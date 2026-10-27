import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Calendar,
  Upload,
  Trash2,
  Columns,
  Eye,
  Plus,
  X,
  Check,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ProgressPhoto } from '@/types/api';
import { todayISO, formatDate } from '@/lib/utils';
import { GlassCard, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';

export default function Photos() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tabs: Gallery or Compare
  const [activeTab, setActiveTab] = useState<'gallery' | 'compare'>('gallery');
  const [viewFilter, setViewFilter] = useState<'all' | 'front' | 'side' | 'back' | 'other'>('all');

  // Queries
  const { data: rawPhotos = [], isLoading } = useQuery<ProgressPhoto[]>({
    queryKey: ['photos'],
    queryFn: () => api.get<ProgressPhoto[]>('/photos'),
  });

  const photos = useMemo(() => {
    return [...rawPhotos].sort((a, b) => b.date.localeCompare(a.date));
  }, [rawPhotos]);

  const filteredPhotos = useMemo(() => {
    if (viewFilter === 'all') return photos;
    return photos.filter((p) => (p.viewType || p.view_type) === viewFilter);
  }, [photos, viewFilter]);

  // Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoDate, setPhotoDate] = useState(todayISO());
  const [viewType, setViewType] = useState<'front' | 'side' | 'back' | 'other'>('front');
  const [notes, setNotes] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Lightbox State
  const [lightboxPhoto, setLightboxPhoto] = useState<ProgressPhoto | null>(null);

  // Delete State
  const [deletePhotoId, setDeletePhotoId] = useState<string | number | null>(null);

  // Side-by-Side Compare Selection
  const [compareLeftId, setCompareLeftId] = useState<string | number | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | number | null>(null);

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Only JPEG, PNG, and WebP images are supported.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('Image size must be less than 10MB.');
      return;
    }

    setUploadError(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No photo selected');

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('view_type', viewType);
      formData.append('recorded_at', photoDate);
      if (notes.trim()) formData.append('notes', notes.trim());

      return api.postMultipart('/photos', formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      setUploadModalOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setNotes('');
    },
    onError: (err: any) => {
      setUploadError(err.message || 'Upload failed');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => api.delete(`/photos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      setDeletePhotoId(null);
      if (lightboxPhoto && lightboxPhoto.id === deletePhotoId) {
        setLightboxPhoto(null);
      }
    },
  });

  // Compare selection resolution
  const photoLeft = useMemo(() => {
    if (compareLeftId) return photos.find((p) => p.id === compareLeftId);
    return photos[photos.length - 1]; // oldest by default
  }, [photos, compareLeftId]);

  const photoRight = useMemo(() => {
    if (compareRightId) return photos.find((p) => p.id === compareRightId);
    return photos[0]; // newest by default
  }, [photos, compareRightId]);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Camera className="h-7 w-7 text-primary" />
            <span>Progress Photos</span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Private, locally stored photo documentation with side-by-side progression analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setUploadModalOpen(true)}
            className="rounded-xl text-xs gap-1.5 h-9"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Photo</span>
          </Button>

          <div className="flex bg-secondary/80 p-0.5 rounded-xl border border-border/50">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'gallery'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Gallery
            </button>
            <button
              onClick={() => setActiveTab('compare')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'compare'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Compare
            </button>
          </div>
        </div>
      </div>

      {/* Tab: Gallery */}
      {activeTab === 'gallery' && (
        <div className="space-y-6">
          {/* View Filter Pill List */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(['all', 'front', 'side', 'back', 'other'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setViewFilter(view)}
                className={`px-3 py-1 rounded-lg text-xs font-medium capitalize transition-all ${
                  viewFilter === view
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-muted-foreground hover:bg-secondary border border-transparent'
                }`}
              >
                {view}
              </button>
            ))}
          </div>

          {filteredPhotos.length === 0 ? (
            <GlassCard className="p-12 text-center border-border/60">
              <EmptyState
                icon={Camera}
                title="No progress photos recorded"
                description="Upload regular physique photos to objectively evaluate long-term visual changes."
                action={
                  <Button
                    onClick={() => setUploadModalOpen(true)}
                    className="rounded-xl text-xs gap-1.5 mt-2"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Upload First Photo</span>
                  </Button>
                }
              />
            </GlassCard>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredPhotos.map((photo) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="group relative rounded-2xl overflow-hidden border border-border/70 bg-card aspect-[3/4] shadow-md hover:shadow-xl transition-all"
                >
                  <img
                    src={photo.url}
                    alt={`${photo.viewType || photo.view_type} view`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                  {/* Badges / Date */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
                    <Badge variant="secondary" className="capitalize text-[10px] bg-black/60 backdrop-blur-md">
                      {photo.viewType || photo.view_type}
                    </Badge>
                  </div>

                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white">
                    <span className="text-xs font-semibold drop-shadow-sm">
                      {formatDate(photo.date, 'MMM d, yyyy')}
                    </span>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setLightboxPhoto(photo)}
                        className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/20 rounded-lg"
                        title="View Fullscreen"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeletePhotoId(photo.id)}
                        className="h-7 w-7 text-white/80 hover:text-rose-400 hover:bg-white/20 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Side-by-Side Compare */}
      {activeTab === 'compare' && (
        <div className="space-y-6">
          {photos.length < 2 ? (
            <GlassCard className="p-12 text-center border-border/60">
              <EmptyState
                icon={Columns}
                title="At least two photos required"
                description="Upload more photos to compare your before-and-after progression."
              />
            </GlassCard>
          ) : (
            <div className="space-y-6">
              {/* Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Baseline Photo (Before)</Label>
                  <select
                    value={photoLeft?.id || ''}
                    onChange={(e) => setCompareLeftId(e.target.value)}
                    className="w-full h-9 rounded-xl bg-secondary border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {photos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatDate(p.date)} &bull; {p.viewType || p.view_type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Progress Photo (After)</Label>
                  <select
                    value={photoRight?.id || ''}
                    onChange={(e) => setCompareRightId(e.target.value)}
                    className="w-full h-9 rounded-xl bg-secondary border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {photos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {formatDate(p.date)} &bull; {p.viewType || p.view_type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Side-by-Side Canvas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                {photoLeft && (
                  <GlassCard className="overflow-hidden border-border/70 shadow-2xl space-y-2 p-3">
                    <div className="aspect-[3/4] relative rounded-xl overflow-hidden bg-black/40">
                      <img
                        src={photoLeft.url}
                        alt="Before"
                        className="w-full h-full object-cover"
                      />
                      <Badge className="absolute top-3 left-3 bg-black/70 backdrop-blur-md">
                        Before &bull; {formatDate(photoLeft.date)}
                      </Badge>
                    </div>
                  </GlassCard>
                )}

                {photoRight && (
                  <GlassCard className="overflow-hidden border-border/70 shadow-2xl space-y-2 p-3">
                    <div className="aspect-[3/4] relative rounded-xl overflow-hidden bg-black/40">
                      <img
                        src={photoRight.url}
                        alt="After"
                        className="w-full h-full object-cover"
                      />
                      <Badge className="absolute top-3 left-3 bg-primary/80 backdrop-blur-md text-white">
                        After &bull; {formatDate(photoRight.date)}
                      </Badge>
                    </div>
                  </GlassCard>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Progress Photo</DialogTitle>
            <DialogDescription className="text-xs">
              Saved locally to your private encrypted storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {uploadError && (
              <div className="p-3 text-xs bg-destructive/15 text-destructive border border-destructive/30 rounded-xl">
                {uploadError}
              </div>
            )}

            {/* Drop / Pick Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-2xl p-6 text-center cursor-pointer transition-colors space-y-2 flex flex-col items-center justify-center min-h-[160px] bg-secondary/30"
            >
              {previewUrl ? (
                <div className="relative w-28 h-36 rounded-xl overflow-hidden shadow-md">
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-xs font-semibold text-foreground">Click to select photo</p>
                  <p className="text-[11px] text-muted-foreground">JPEG, PNG, or WebP up to 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">View Perspective</Label>
                <select
                  value={viewType}
                  onChange={(e: any) => setViewType(e.target.value)}
                  className="w-full h-9 rounded-xl bg-secondary border border-border px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="front">Front</option>
                  <option value="side">Side</option>
                  <option value="back">Back</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Date Taken</Label>
                <Input
                  type="date"
                  value={photoDate}
                  onChange={(e) => setPhotoDate(e.target.value)}
                  max={todayISO()}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Input
                placeholder="e.g. Morning, natural lighting, fasted..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !selectedFile}
              className="rounded-xl text-xs h-9"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload Photo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Lightbox Modal */}
      <Dialog open={lightboxPhoto !== null} onOpenChange={(open) => !open && setLightboxPhoto(null)}>
        <DialogContent className="sm:max-w-3xl p-2 bg-black/95 border-border/40">
          {lightboxPhoto && (
            <div className="space-y-2">
              <div className="relative max-h-[80vh] flex items-center justify-center overflow-hidden rounded-xl">
                <img
                  src={lightboxPhoto.url}
                  alt="Enlarged view"
                  className="max-h-[75vh] w-auto object-contain rounded-xl"
                />
              </div>
              <div className="p-3 flex items-center justify-between text-white text-xs">
                <div>
                  <p className="font-semibold capitalize">
                    {lightboxPhoto.viewType || lightboxPhoto.view_type} View &bull; {formatDate(lightboxPhoto.date)}
                  </p>
                  {lightboxPhoto.notes && (
                    <p className="text-muted-foreground text-[11px] italic mt-0.5">
                      "{lightboxPhoto.notes}"
                    </p>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeletePhotoId(lightboxPhoto.id)}
                  className="h-8 rounded-lg text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  <span>Delete</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deletePhotoId !== null}
        onOpenChange={(open) => !open && setDeletePhotoId(null)}
        title="Delete Progress Photo"
        description="Are you sure you want to permanently delete this photo? The image file will be removed from your server."
        confirmText="Delete"
        destructive
        onConfirm={() => deletePhotoId && deleteMutation.mutate(deletePhotoId)}
      />
    </div>
  );
}
