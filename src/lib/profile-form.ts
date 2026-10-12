/** Matches the DB columns: Profile.alias is 40 and Profile.email is 120. */
const MAX_NAME = 40;
const MAX_EMAIL = 120;

// Deliberately permissive: the email is contact data, not a credential, and it
// is never verified. We only reject what is obviously not an address.
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

type ProfileFormValues = { name: string; email: string };
type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, "nameError" | "emailError">>;

/** Shape check only, shared with the API route so the regex lives in one place. */
function isEmailShaped(email: string): boolean {
  return EMAIL.test(email);
}

function validateProfileForm(values: ProfileFormValues): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const name = values.name.trim();
  if (name.length < 2 || name.length > MAX_NAME) errors.name = "nameError";
  const email = values.email.trim();
  if (email.length > MAX_EMAIL || !isEmailShaped(email)) errors.email = "emailError";
  return errors;
}

export { isEmailShaped, MAX_EMAIL, MAX_NAME, validateProfileForm };
export type { ProfileFormErrors, ProfileFormValues };
