import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { Star, MapPin, Github, Globe, Camera, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function Profile({ token, currentUser }) {
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
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${currentUser._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load user profile");
      setProfile(data.user);
      setReviews(data.reviews || []);
      setBio(data.user.bio || "");
      setCollege(data.user.college || "");
      setSkills(data.user.skills || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
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
      if (!res.ok) throw new Error(data.message || "Failed to save profile changes");
      setProfile(data);
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (err) {
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
      if (!res.ok) throw new Error(data.message || "Avatar upload failed");
      
      // Update local profile state
      setProfile({ ...profile, avatarUrl: data.avatarUrl });
      toast.success("Avatar image uploaded to profile!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addSkill = () => {
    if (!newSkill.trim()) return;
    if (skills.includes(newSkill.trim())) return;
    setSkills([...skills, newSkill.trim()]);
    setNewSkill("");
  };

  const removeSkill = (skillToRemove) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center animate-pulse">
        <p className="font-serif text-xl">Retrieving portfolio details...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center">
        <h2 className="font-serif text-2xl">Profile not loaded</h2>
        <p className="text-muted-foreground mt-2">Sign in to view your public student profile card.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-12 space-y-10">
      <header className="paper hairline rounded-3xl p-8 lg:p-10 grid lg:grid-cols-3 gap-8 relative overflow-hidden">
        <div className="absolute -bottom-20 -right-10 size-72 rounded-full bg-[var(--brand-gold)]/15 blur-3xl" />
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-4">
            {/* Avatar block with upload trigger */}
            <div className="relative group size-20 rounded-full border border-border overflow-hidden bg-secondary">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className="size-full object-cover rounded-full" />
              ) : (
                <div className="size-full grid place-items-center bg-[var(--brand-espresso)] text-[var(--brand-gold)] font-serif text-2xl">
                  {profile.name.split(" ").map(n => n[0]).join("")}
                </div>
              )}
              <label className="absolute inset-0 bg-black/40 grid place-items-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="size-5 text-white" />
                <input type="file" className="hidden" onChange={handleAvatarChange} disabled={uploadingAvatar} />
              </label>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="eyebrow capitalize">{profile.role} · {profile.college || "Independent Campus"}</span>
                <StatusBadge tone="success">Active</StatusBadge>
              </div>
              <h1 className="display text-4xl mt-1">{profile.name}</h1>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-3 pt-2 max-w-xl">
              <div>
                <label className="text-xs text-muted-foreground">College / Organization</label>
                <Input value={college} onChange={(e) => setCollege(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">About / Biography</label>
                <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveProfile} className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)]">Save</Button>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="rounded-full">Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="font-serif italic text-lg text-muted-foreground mt-2">
                {profile.bio || "No biography written yet. Click edit profile to add details."}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> India</span>
                <span className="inline-flex items-center gap-1.5"><Star className="size-3.5 fill-[var(--brand-gold)] text-[var(--brand-gold)]" /> <span className="num">{profile.rating}</span> · {reviews.length} reviews</span>
              </div>
              <div className="mt-6 flex gap-2">
                <Button onClick={() => setIsEditing(true)} variant="outline" className="rounded-full">Edit profile</Button>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 self-start">
          {[
            { k: "Completed Briefs", v: profile.completedProjects || 0 },
            { k: "Average rating", v: `${profile.rating} ★` },
            { k: "Profile views", v: profile.profileViews || 0 },
            { k: "Skills count", v: skills.length },
          ].map(s => (
            <div key={s.k} className="hairline rounded-2xl p-4 bg-card/25">
              <span className="eyebrow">{s.k}</span>
              <p className="font-serif text-2xl mt-1 num">{s.v}</p>
            </div>
          ))}
        </div>
      </header>

      <section className="grid lg:grid-cols-3 gap-6">
        {/* Skills area */}
        <div className="lg:col-span-2 paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Skills and tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {skills.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No skills listed yet.</p>
            ) : (
              skills.map(s => (
                <span key={s} className="text-sm px-3 py-1 rounded-full hairline bg-card flex items-center gap-1.5">
                  {s}
                  {isEditing && (
                    <button onClick={() => removeSkill(s)} className="text-muted-foreground hover:text-red-500">
                      ×
                    </button>
                  )}
                </span>
              ))
            )}
          </div>
          {isEditing && (
            <div className="mt-4 flex gap-1.5 max-w-xs">
              <Input
                placeholder="Add skill tag..."
                className="h-8 text-xs"
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkill()}
              />
              <Button size="sm" onClick={addSkill} className="h-8">
                <Plus className="size-4.5" />
              </Button>
            </div>
          )}

          <h2 className="font-serif text-xl mt-8 mb-4">Reputation details</h2>
          <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
            Ratings and reviews are automatically updated once active briefs transition to completed. Escrow releases guarantee honest work history.
          </p>
        </div>

        {/* Reviews List */}
        <div className="paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Work reviews ({reviews.length})</h2>
          <div className="space-y-5">
            {reviews.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No reviews yet. Completed projects display reviews.
              </div>
            ) : (
              reviews.map((r, i) => (
                <div key={i} className="border-b border-border/40 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      {r.reviewerId?.avatarUrl ? (
                        <img src={r.reviewerId.avatarUrl} alt={r.reviewerId.name} className="size-full rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-[10px] bg-[var(--brand-bronze)] text-[var(--brand-gold)]">
                          {(r.reviewerId?.name || "R").split(" ").map(x => x[0]).join("")}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{r.reviewerId?.name}</p>
                      <p className="text-[11px] text-muted-foreground">{"★".repeat(r.rating)}</p>
                    </div>
                  </div>
                  <p className="font-serif italic text-sm text-muted-foreground mt-2">"{r.comment}"</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
