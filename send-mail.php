<?php
// send-mail.php
header('Content-Type: application/json');

// Enable error reporting for debugging (disable in production)
error_reporting(0);
ini_set('display_errors', 0);

// Your email address where messages will be sent
$to_email = "thirtsaisimbi@gmail.com";

// Check if form was submitted
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    
    // Get form data and sanitize
    $first_name = isset($_POST['first_name']) ? strip_tags(trim($_POST['first_name'])) : '';
    $last_name = isset($_POST['last_name']) ? strip_tags(trim($_POST['last_name'])) : '';
    $phone = isset($_POST['phone']) ? strip_tags(trim($_POST['phone'])) : '';
    $email = isset($_POST['email']) ? filter_var(trim($_POST['email']), FILTER_SANITIZE_EMAIL) : '';
    $website = isset($_POST['website']) ? strip_tags(trim($_POST['website'])) : '';
    $subject = isset($_POST['subject']) ? strip_tags(trim($_POST['subject'])) : '';
    $message = isset($_POST['message']) ? strip_tags(trim($_POST['message'])) : '';
    
    // Validate required fields
    $errors = [];
    
    if (empty($first_name)) {
        $errors[] = 'First name is required';
    }
    
    if (empty($last_name)) {
        $errors[] = 'Last name is required';
    }
    
    if (empty($phone)) {
        $errors[] = 'Phone number is required';
    }
    
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Valid email is required';
    }
    
    if (empty($subject)) {
        $errors[] = 'Subject is required';
    }
    
    if (empty($message)) {
        $errors[] = 'Message is required';
    }
    
    // If there are errors, return them
    if (!empty($errors)) {
        echo json_encode([
            'success' => false,
            'message' => implode('<br>', $errors)
        ]);
        exit;
    }
    
    // Prepare email content
    $full_name = $first_name . ' ' . $last_name;
    
    $email_subject = "Contact Form: $subject - from $full_name";
    
    $email_body = "
    <html>
    <head>
        <title>New Contact Form Submission</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            h2 { color: #ff5e14; border-bottom: 2px solid #ff5e14; padding-bottom: 10px; }
            .info { margin-bottom: 20px; }
            .label { font-weight: bold; color: #555; width: 120px; display: inline-block; }
            .value { color: #000; }
            .message-box { background: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 20px; }
            .footer { margin-top: 30px; font-size: 12px; color: #999; text-align: center; }
        </style>
    </head>
    <body>
        <div class='container'>
            <h2>New Contact Form Submission</h2>
            <div class='info'>
                <p><span class='label'>Name:</span> <span class='value'>$full_name</span></p>
                <p><span class='label'>Email:</span> <span class='value'>$email</span></p>
                <p><span class='label'>Phone:</span> <span class='value'>$phone</span></p>
                " . (!empty($website) ? "<p><span class='label'>Website:</span> <span class='value'>$website</span></p>" : "") . "
                <p><span class='label'>Subject:</span> <span class='value'>$subject</span></p>
            </div>
            <div class='message-box'>
                <h4>Message:</h4>
                <p>" . nl2br($message) . "</p>
            </div>
            <div class='footer'>
                <p>This email was sent from your website contact form.</p>
            </div>
        </div>
    </body>
    </html>
    ";
    
    // Email headers
    $headers = "MIME-Version: 1.0" . "\r\n";
    $headers .= "Content-type:text/html;charset=UTF-8" . "\r\n";
    $headers .= "From: " . $full_name . " <" . $email . ">" . "\r\n";
    $headers .= "Reply-To: " . $email . "\r\n";
    $headers .= "X-Mailer: PHP/" . phpversion();
    
    // Send email
    $mail_sent = mail($to_email, $email_subject, $email_body, $headers);
    
    if ($mail_sent) {
        echo json_encode([
            'success' => true,
            'message' => 'Thank you! Your message has been sent successfully.'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'Failed to send email. Please try again later.'
        ]);
    }
    
} else {
    // If someone tries to access this file directly
    echo json_encode([
        'success' => false,
        'message' => 'Invalid request method.'
    ]);
}
?>