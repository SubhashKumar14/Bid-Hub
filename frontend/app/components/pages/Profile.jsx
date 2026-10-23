import { Button } from "../ui/button";
import { useCapabilities } from "../../../api/capabilities";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Star, MapPin, Camera, Plus, X } from "lucide-react";
import { BrandIcon } from "../../brand/BrandIcon";
import { BrandState } from "../../brand/BrandState";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export function Profile({ token, currentUser, onUserUpdate }) {
  const capabilities = useCapabilities();
  const active = useRef(token);
  useEffect(() => { active.current = token; return () => { active.current = ""; }; }, [token]);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [college, setCollege] = useState("");
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const fetchProfileData = async () => {
    if (!currentUser) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`/api/users/${currentUser._id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "Failed to load user profile");
      setProfile(data.user);
      setReviews(data.reviews || []);
      setBio(data.user.bio || "");
      setCollege(data.user.college || "");
      setSkills(data.user.skills || []);
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (active.current === token) setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [currentUser]);

  const handleSaveProfile = async () => {
    try {
      const res = await fetch(`/api/users/${currentUser._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bio, college, skills }),
      });
      const data = await res.json();
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "Failed to save profile changes");
      setProfile(data);
      onUserUpdate?.(data);
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAvatar(true);
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch("/api/users/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "Avatar upload failed");

      setProfile({ ...profile, avatarUrl: data.avatarUrl });
      onUserUpdate?.({ ...currentUser, avatarUrl: data.avatarUrl });
      toast.success("Profile photo updated");
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (active.current === token) setUploadingAvatar(false);
    }
  };

  const addSkill = () => {
    const s = newSkill.trim();
    if (!s) return;
    if (skills.includes(s)) return;
    setSkills([...skills, s]);
    setNewSkill("");
  };

  const removeSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-20 text-center animate-pulse">
        <p className="text-sm text-muted-foreground">Retrieving profile and work evidence…</p>
      </div>
    );
  }

  if (error && !profile) return <div role="alert" className="p-8"><p>{error}</p><Button onClick={fetchProfileData}>Retry</Button></div>;
  if (!profile) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-20 text-center bg-card border border-border rounded-[8px] mt-8">
        <h2 className="text-xl font-medium text-foreground">Profile not available</h2>
        <p className="text-xs text-muted-foreground mt-1">Please sign in to view and manage your profile.</p>
      </div>
    );
  }

  // Calculate actual rating from review evidence
  const actualRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {error && <p role="alert" className="text-sm text-destructive">{error} Your edits are retained; correct or retry saving.</p>}
      {/* Profile Header Card */}
      <header className="bg-card border border-border rounded-[8px] p-6 lg:p-8 grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar block with upload trigger */}
            <div className="relative group size-20 rounded-[6px] border border-border overflow-hidden bg-secondary shrink-0">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} loading="lazy" className="size-full object-cover rounded-[6px]" />
              ) : (
                <div className="size-full grid place-items-center bg-secondary text-foreground text-xl font-medium">
                  {profile.name ? profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("") : "U"}
                </div>
              )}
              <label
                aria-label="Update profile photo"
                className="absolute inset-0 bg-foreground/60 text-background grid place-items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 cursor-pointer transition-opacity"
              >
                <Camera aria-hidden="true" className="size-5" />
                <input type="file" className="sr-only" aria-label="Update profile photo" onChange={handleAvatarChange} disabled={uploadingAvatar || !capabilities?.avatarUploads} />
              </label>
            </div>

            <div className="min-w-0">
              {!capabilities?.avatarUploads && <p className="text-xs text-muted-foreground">Photo uploads unavailable; the operator must configure avatar storage.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <span className="eyebrow text-xs capitalize text-muted-foreground">
                  {profile.role} · {profile.college || (profile.role === "student" ? "Student" : "Client")}
                </span>
                <StatusBadge tone="success" className="text-[10px] py-0">
                  Registered Account
                </StatusBadge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-foreground mt-1 truncate">
                {profile.name}
              </h1>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-3 pt-2 max-w-xl">
              <div>
                <label htmlFor="profile-college" className="text-xs font-medium text-foreground block mb-1">
                  College / Campus or Company
                </label>
                <Input
                  id="profile-college"
                  value={college}
                  onChange={(e) => setCollege(e.target.value)}
                  className="h-10 text-xs"
                />
              </div>
              <div>
                <label htmlFor="profile-bio" className="text-xs font-medium text-foreground block mb-1">
                  Brief Bio & Specialization
                </label>
                <Textarea
                  id="profile-bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="text-xs"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="default" onClick={handleSaveProfile} className="rounded-[5px] text-xs h-9 px-4 font-medium">
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-[5px] text-xs h-9 px-4 font-medium">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2 max-w-xl">
                {profile.bio || "No biography provided yet. Add your technical disciplines, coursework, and specialties."}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted-foreground" /> India
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-3.5 fill-[var(--brand-accent)] text-[var(--brand-accent)]" />
                  {actualRating ? (
                    <span><strong className="num text-foreground">{actualRating}</strong> · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span>
                  ) : (
                    <span className="text-muted-foreground">No reviews yet</span>
                  )}
                </span>
              </div>
              <div className="pt-2">
                <Button variant="outline" onClick={() => setIsEditing(true)} className="rounded-[5px] text-xs h-8 px-3 font-medium">
                  Edit profile
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Portfolio Numbers */}
        <div className="grid grid-cols-2 gap-3 self-start">
          {[
            { k: "Completed Briefs", v: profile.completedProjects || 0 },
            { k: "Verified Reviews", v: reviews.length },
            { k: "Profile Views", v: profile.profileViews || 0 },
            { k: "Active Skills", v: skills.length },
          ].map((s) => (
            <div key={s.k} className="border border-border rounded-[6px] p-3.5 bg-secondary/30">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{s.k}</span>
              <p className="text-xl font-medium mt-1 num text-foreground">{s.v}</p>
            </div>
          ))}
        </div>
      </header>

      {/* Main Content: Skills & Review Evidence */}
      <section className="grid lg:grid-cols-3 gap-6">
        {/* Skills area */}
        <div className="lg:col-span-2 bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h2 className="text-base font-medium text-foreground">Skills & Specializations</h2>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {skills.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No skills listed yet.</p>
            ) : (
              skills.map((s) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-[4px] bg-secondary text-foreground font-mono flex items-center gap-1.5 border border-border">
                  {s}
                  {isEditing && (
                    <button
                      type="button"
                      aria-label={`Remove ${s}`}
                      onClick={() => removeSkill(s)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          {isEditing && (
            <div className="flex gap-2 max-w-sm pt-2">
              <Input
                aria-label="Add skill tag"
                placeholder="New skill tag…"
                className="h-9 text-xs"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={addSkill} className="h-9 rounded-[5px] text-xs px-3 shrink-0">
                <Plus className="size-3.5 mr-1" /> Add
              </Button>
            </div>
          )}

          <div className="pt-6 border-t border-border/60 space-y-2">
            <div className="flex items-center gap-2">
              <BrandIcon name="work-record" size={18} className="text-[var(--brand-accent)]" />
              <h3 className="text-sm font-medium text-foreground">Verified Work Record</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
              Ratings and reviews on Bid·Hub are strictly tied to completed project milestones and authorized escrow releases.
            </p>
          </div>
        </div>

        {/* Reviews List */}
        <div className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="pb-2 border-b border-border/60">
            <h2 className="text-base font-medium text-foreground">Client Reviews ({reviews.length})</h2>
          </div>

          <div className="space-y-4">
            {reviews.length === 0 ? (
              <BrandState
                name="no-reviews"
                title="No reviews recorded yet"
                description="Participants may leave feedback after the project is completed."
                compact
              />
            ) : (
              reviews.map((r, i) => (
                <div key={i} className="border-b border-border/50 pb-4 last:border-0 last:pb-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7 rounded-[4px] border border-border">
                      {r.reviewerId?.avatarUrl ? (
                        <img src={r.reviewerId.avatarUrl} alt="" className="size-full rounded-[4px] object-cover" />
                      ) : (
                        <AvatarFallback className="text-[10px] bg-secondary text-foreground font-medium rounded-[4px]">
                          {(r.reviewerId?.name || "C").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="text-xs leading-tight">
                      <p className="font-medium text-foreground">{r.reviewerId?.name || "Client"}</p>
                      <p className="text-[11px] text-[var(--brand-accent)] mt-0.5">
                        {"★".repeat(r.rating || 5)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    "{r.comment}"
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
