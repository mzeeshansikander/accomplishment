// Icons
import call from 'public/icons/call.svg';
import linkIcon from 'public/icons/link.svg';
import location from 'public/icons/location.svg';
import sms from 'public/icons/sms.svg';

// Utility
import { formatPhoneNumber } from '@/utils/format-phone';
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
  const formattedPhone = formatPhoneNumber(phone_number, iso2);

  return [
    { icon: sms, label: email },
    { icon: call, label: formattedPhone },
    { icon: location, label: address },
    { icon: linkIcon, label: link },
  ];
};
