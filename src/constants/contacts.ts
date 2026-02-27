// Icons
import call from 'public/icons/call.svg';
import linkIcon from 'public/icons/link.svg';
import location from 'public/icons/location.svg';
import sms from 'public/icons/sms.svg';

// Type
import { parsePhoneNumber } from 'libphonenumber-js';
import { StaticImageData } from 'next/image';

type IContact = Array<{ label?: string; icon: StaticImageData }>;

export const contacts = ({
  link,
  email,
  address,
  phone_number,
  iso2,
}: {
  link?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  iso2?: string;
}): IContact => {
  let countryCode = phone_number || '';
  try {
    const phoneNumber = parsePhoneNumber(phone_number || '', (iso2 as 'US') || 'US');
    if (phoneNumber) {
      const formatNumber = phoneNumber.formatNational();
      countryCode = `+${phoneNumber.countryCallingCode} ${formatNumber}`;
    }
  } catch (error) {
    console.warn('Error parsing phone number:', error);
  }

  return [
    { icon: sms, label: email },
    { icon: call, label: countryCode },
    { icon: location, label: address },
    { icon: linkIcon, label: link },
  ];
};
