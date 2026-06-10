// Public API of the inquiries feature.
export {
  submitInquiryCore,
  submitInquiry,
  listInquiries,
  markInquiryResolved,
  stampInquiryReplied,
  resolveMyInquiry,
  editMyInquiry,
} from "./inquiry-actions";
export type { InquiryRow, InquirySubmitResult } from "./inquiry-actions";
export { InquiryList } from "./components/inquiry-list";
export { mailtoUrl, replyBody, replySubject, smsUrl } from "./reply-draft";
