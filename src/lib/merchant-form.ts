import { isMerchantCategory } from "./merchant-categories";
import { isCurrency } from "./money";
import { isEmailShaped } from "./profile-form";

/** Mirrors the Merchant columns so the form can never write a value the DB rejects. */
const MERCHANT_LIMITS = { name: 60, city: 60, streetAddress: 120, email: 120 } as const;

const COUNTRY = /^[A-Za-z]{2}$/;

type MerchantFormValues = {
  name: string;
  category: string;
  city: string;
  streetAddress: string;
  country: string;
  currency: string;
  email: string;
};

type MerchantFormErrors = Partial<Record<keyof MerchantFormValues, `${keyof MerchantFormValues}Error`>>;

/** Same function on the screen and in the route: one definition of valid. */
function validateMerchantForm(values: MerchantFormValues): MerchantFormErrors {
  const errors: MerchantFormErrors = {};
  const name = values.name.trim();
  if (name.length < 2 || name.length > MERCHANT_LIMITS.name) errors.name = "nameError";
  if (!isMerchantCategory(values.category)) errors.category = "categoryError";
  const city = values.city.trim();
  if (city.length < 2 || city.length > MERCHANT_LIMITS.city) errors.city = "cityError";
  const street = values.streetAddress.trim();
  if (street.length < 2 || street.length > MERCHANT_LIMITS.streetAddress) {
    errors.streetAddress = "streetAddressError";
  }
  if (!COUNTRY.test(values.country.trim())) errors.country = "countryError";
  if (!isCurrency(values.currency)) errors.currency = "currencyError";
  const email = values.email.trim();
  // Shape check shared with the person's registration: one regex, one place.
  if (email !== "" && (email.length > MERCHANT_LIMITS.email || !isEmailShaped(email))) {
    errors.email = "emailError";
  }
  return errors;
}

export { MERCHANT_LIMITS, validateMerchantForm };
export type { MerchantFormErrors, MerchantFormValues };
