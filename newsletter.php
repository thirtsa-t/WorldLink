<?php
// newsletter.php
header('Content-Type: application/json');

$to_email = "thirtsaisimbi@gmail.com";

if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['newsletter_email'])) {
    
    $email = filter_var(trim($_POST['newsletter_email']), FILTER_SANITIZE_EMAIL);
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'message' => 'Invalid email address']);
        exit;
    }
    
    $subject = "New Newsletter Subscription";
    $body = "New subscriber: $email";
    $headers = "From: $email\r\nReply-To: $email";
    
    $mail_sent = mail($to_email, $subject, $body, $headers);
    
    if ($mail_sent) {
        echo json_encode(['success' => true, 'message' => 'Thank you for subscribing!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Subscription failed']);
    }
}
?>